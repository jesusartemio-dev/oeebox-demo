-- ============================================================
-- OEEBox – Schema completo para sistema OEE industrial
-- PostgreSQL 14+
-- ============================================================

-- 1. box_config
-- Configuración global de la instalación OEEBox.
-- Solo debe existir una fila (id = 1).
CREATE TABLE IF NOT EXISTS box_config (
  id            SERIAL PRIMARY KEY,
  plant_name    VARCHAR(120) NOT NULL,
  company_name  VARCHAR(120) NOT NULL,
  license_key   VARCHAR(255),
  timezone      VARCHAR(60)  NOT NULL DEFAULT 'America/Mexico_City',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. workcells
-- Máquinas o líneas de producción monitoreadas.
-- Cada workcell se conecta a un PLC mediante el protocolo indicado.
CREATE TABLE IF NOT EXISTS workcells (
  id              SERIAL PRIMARY KEY,
  code            VARCHAR(20)  NOT NULL UNIQUE,
  name            VARCHAR(120) NOT NULL,
  active          BOOLEAN      NOT NULL DEFAULT TRUE,
  plc_protocol    VARCHAR(30)  NOT NULL,            -- modbus-tcp, ethernet-ip, etc.
  plc_ip          VARCHAR(45)  NOT NULL,
  plc_port        INTEGER      NOT NULL DEFAULT 502,
  plc_slot        INTEGER      NOT NULL DEFAULT 0,
  tag_total_parts VARCHAR(120),
  tag_good_parts  VARCHAR(120),
  tag_scrap_parts VARCHAR(120),
  tag_machine_run VARCHAR(120),
  tag_fault_active VARCHAR(120),
  tag_fault_code  VARCHAR(120),
  tag_shift_active VARCHAR(120),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 3. part_numbers
-- Números de parte asignados a cada workcell.
-- ideal_cycle_time se expresa en segundos.
CREATE TABLE IF NOT EXISTS part_numbers (
  id               SERIAL PRIMARY KEY,
  workcell_id      INTEGER      NOT NULL REFERENCES workcells(id) ON DELETE CASCADE,
  part_number      VARCHAR(60)  NOT NULL,
  description      VARCHAR(255),
  ideal_cycle_time REAL         NOT NULL,            -- segundos por pieza
  active           BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (workcell_id, part_number)
);

-- 4. shifts
-- Turnos de trabajo por workcell.
-- active_days es un arreglo de enteros (1=lun … 7=dom) según ISO-8601.
CREATE TABLE IF NOT EXISTS shifts (
  id            SERIAL PRIMARY KEY,
  workcell_id   INTEGER     NOT NULL REFERENCES workcells(id) ON DELETE CASCADE,
  shift_number  SMALLINT    NOT NULL CHECK (shift_number BETWEEN 1 AND 3),
  name          VARCHAR(60) NOT NULL,
  start_time    TIME        NOT NULL,
  end_time      TIME        NOT NULL,
  active_days   INTEGER[]   NOT NULL DEFAULT '{1,2,3,4,5}',
  active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workcell_id, shift_number)
);

-- 5. operators
-- Operadores que pueden atender eventos y paros.
CREATE TABLE IF NOT EXISTS operators (
  id            SERIAL PRIMARY KEY,
  badge_number  VARCHAR(30)  NOT NULL UNIQUE,
  name          VARCHAR(120) NOT NULL,
  active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 6. reason_codes
-- Catálogo de razones de paro / eventos.
-- category agrupa las razones; event_type indica si aplica a downtime, scrap, etc.
CREATE TABLE IF NOT EXISTS reason_codes (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(20)  NOT NULL UNIQUE,
  label       VARCHAR(120) NOT NULL,
  category    VARCHAR(60)  NOT NULL,
  event_type  VARCHAR(30)  NOT NULL DEFAULT 'downtime',  -- downtime, scrap, speed_loss
  active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Razones de paro predefinidas
INSERT INTO reason_codes (code, label, category, event_type) VALUES
  ('MF01', 'Falla mecánica',             'Mecánica',       'downtime'),
  ('EF01', 'Falla eléctrica',            'Eléctrica',      'downtime'),
  ('CR01', 'Cambio de referencia',        'Cambio',         'downtime'),
  ('FM01', 'Falta de material',           'Logística',      'downtime'),
  ('MP01', 'Mantenimiento preventivo',    'Mantenimiento',  'downtime'),
  ('MC01', 'Mantenimiento correctivo',    'Mantenimiento',  'downtime'),
  ('AJ01', 'Ajuste de máquina',          'Ajuste',         'downtime'),
  ('HE01', 'Falta de herramienta',        'Herramientas',   'downtime'),
  ('CA01', 'Cambio de turno',             'Organizacional', 'downtime'),
  ('ES01', 'Espera de calidad',           'Calidad',        'downtime'),
  ('PN01', 'Falla neumática',             'Neumática',      'downtime'),
  ('LU01', 'Falta de lubricación',        'Mantenimiento',  'downtime'),
  ('SO01', 'Sobrecalentamiento',          'Mecánica',       'downtime'),
  ('SE01', 'Falla de sensor',             'Eléctrica',      'downtime'),
  ('OP01', 'Sin operador disponible',     'Organizacional', 'downtime')
ON CONFLICT (code) DO NOTHING;

-- 7. oee_records
-- Registros de OEE por período (típicamente por turno o por hora).
-- period_end NULL indica un registro en curso.
CREATE TABLE IF NOT EXISTS oee_records (
  id               SERIAL PRIMARY KEY,
  workcell_id      INTEGER     NOT NULL REFERENCES workcells(id) ON DELETE CASCADE,
  shift_id         INTEGER     REFERENCES shifts(id) ON DELETE SET NULL,
  part_number_id   INTEGER     REFERENCES part_numbers(id) ON DELETE SET NULL,
  period_start     TIMESTAMPTZ NOT NULL,
  period_end       TIMESTAMPTZ,
  total_parts      INTEGER     NOT NULL DEFAULT 0,
  good_parts       INTEGER     NOT NULL DEFAULT 0,
  scrap_parts      INTEGER     NOT NULL DEFAULT 0,
  available_time   REAL        NOT NULL DEFAULT 0,    -- segundos
  running_time     REAL        NOT NULL DEFAULT 0,    -- segundos
  ideal_cycle_time REAL,                               -- segundos (snapshot)
  availability     REAL,                               -- 0.0 – 1.0
  performance      REAL,
  quality          REAL,
  oee              REAL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oee_records_workcell_period
  ON oee_records (workcell_id, period_start);

CREATE INDEX IF NOT EXISTS idx_oee_records_open
  ON oee_records (period_end) WHERE period_end IS NULL;

-- 8. events
-- Eventos de paro, fallas y anotaciones manuales.
-- ended_at NULL indica un evento activo (en curso).
CREATE TABLE IF NOT EXISTS events (
  id                SERIAL PRIMARY KEY,
  workcell_id       INTEGER     NOT NULL REFERENCES workcells(id) ON DELETE CASCADE,
  oee_record_id     INTEGER     REFERENCES oee_records(id) ON DELETE SET NULL,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at          TIMESTAMPTZ,
  duration_seconds  REAL,
  event_type        VARCHAR(30) NOT NULL,               -- fault, stop, micro_stop, manual
  fault_code        VARCHAR(20),
  fault_code_raw    INTEGER,
  reason_code       VARCHAR(20),
  reason_label      VARCHAR(120),
  comment           TEXT,
  operator_id       INTEGER     REFERENCES operators(id) ON DELETE SET NULL,
  acknowledged_at   TIMESTAMPTZ,
  source            VARCHAR(10) NOT NULL DEFAULT 'plc'
                    CHECK (source IN ('plc', 'manual', 'both')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_workcell_started
  ON events (workcell_id, started_at);

CREATE INDEX IF NOT EXISTS idx_events_open
  ON events (ended_at) WHERE ended_at IS NULL;

-- 9. plc_state
-- Estado en tiempo real del PLC, una fila por workcell.
-- Se actualiza mediante UPSERT cada segundo desde el conector.
CREATE TABLE IF NOT EXISTS plc_state (
  workcell_id       INTEGER PRIMARY KEY REFERENCES workcells(id) ON DELETE CASCADE,
  machine_running   BOOLEAN   NOT NULL DEFAULT FALSE,
  fault_active      BOOLEAN   NOT NULL DEFAULT FALSE,
  fault_code        INTEGER   DEFAULT 0,
  connected         BOOLEAN   NOT NULL DEFAULT FALSE,
  raw_total_parts   INTEGER   NOT NULL DEFAULT 0,
  raw_good_parts    INTEGER   NOT NULL DEFAULT 0,
  raw_scrap_parts   INTEGER   NOT NULL DEFAULT 0,
  oee               REAL      DEFAULT 0,
  availability      REAL      DEFAULT 0,
  performance       REAL      DEFAULT 0,
  quality           REAL      DEFAULT 0,
  current_shift_id  INTEGER   REFERENCES shifts(id) ON DELETE SET NULL,
  current_part_id   INTEGER   REFERENCES part_numbers(id) ON DELETE SET NULL,
  last_update       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Datos iniciales de ejemplo
-- ============================================================

-- box_config
INSERT INTO box_config (plant_name, company_name, license_key, timezone) VALUES
  ('Planta Monterrey', 'OEEBox Demo', 'DEMO-0000-0000-0001', 'America/Mexico_City')
ON CONFLICT DO NOTHING;

-- Workcells
INSERT INTO workcells (code, name, plc_protocol, plc_ip, plc_port, plc_slot,
  tag_total_parts, tag_good_parts, tag_scrap_parts,
  tag_machine_run, tag_fault_active, tag_fault_code, tag_shift_active)
VALUES
  ('L01', 'Ensamble',  'modbus-tcp',   '192.168.1.10', 502, 0,
   'HR100', 'HR101', 'HR102', 'HR103', 'HR104', 'HR105', 'HR106'),
  ('L02', 'Soldadura', 'ethernet-ip',  '192.168.1.20', 44818, 1,
   'Program:Main.TotalParts', 'Program:Main.GoodParts', 'Program:Main.ScrapParts',
   'Program:Main.MachineRun', 'Program:Main.FaultActive', 'Program:Main.FaultCode',
   'Program:Main.ShiftActive')
ON CONFLICT (code) DO NOTHING;

-- Shifts – 3 turnos por workcell
INSERT INTO shifts (workcell_id, shift_number, name, start_time, end_time, active_days) VALUES
  -- L01 Ensamble
  ((SELECT id FROM workcells WHERE code = 'L01'), 1, 'Matutino',    '06:00', '14:00', '{1,2,3,4,5}'),
  ((SELECT id FROM workcells WHERE code = 'L01'), 2, 'Vespertino',  '14:00', '22:00', '{1,2,3,4,5}'),
  ((SELECT id FROM workcells WHERE code = 'L01'), 3, 'Nocturno',    '22:00', '06:00', '{1,2,3,4,5}'),
  -- L02 Soldadura
  ((SELECT id FROM workcells WHERE code = 'L02'), 1, 'Matutino',    '06:00', '14:00', '{1,2,3,4,5}'),
  ((SELECT id FROM workcells WHERE code = 'L02'), 2, 'Vespertino',  '14:00', '22:00', '{1,2,3,4,5}'),
  ((SELECT id FROM workcells WHERE code = 'L02'), 3, 'Nocturno',    '22:00', '06:00', '{1,2,3,4,5}')
ON CONFLICT (workcell_id, shift_number) DO NOTHING;

-- Part numbers – 2 por workcell
INSERT INTO part_numbers (workcell_id, part_number, description, ideal_cycle_time) VALUES
  ((SELECT id FROM workcells WHERE code = 'L01'), 'PN-1001', 'Ensamble chasis A',    12.5),
  ((SELECT id FROM workcells WHERE code = 'L01'), 'PN-1002', 'Ensamble chasis B',    18.0),
  ((SELECT id FROM workcells WHERE code = 'L02'), 'PN-2001', 'Soldadura marco std',   8.0),
  ((SELECT id FROM workcells WHERE code = 'L02'), 'PN-2002', 'Soldadura marco ref',  22.0)
ON CONFLICT (workcell_id, part_number) DO NOTHING;

-- plc_state – inicializar fila por workcell
INSERT INTO plc_state (workcell_id) VALUES
  ((SELECT id FROM workcells WHERE code = 'L01')),
  ((SELECT id FROM workcells WHERE code = 'L02'))
ON CONFLICT (workcell_id) DO NOTHING;
