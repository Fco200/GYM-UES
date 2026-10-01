-- ============================================================================
-- Gym UES - Script de respaldo: crea la base de datos y tablas necesarias
-- Compatible con MySQL / MariaDB (XAMPP). Se puede reejecutar sin problemas.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS gym_ues_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE gym_ues_db;

-- ----------------------------------------------------------------------------
-- Tabla: students (alumnos, maestros y personas exteriores)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_code VARCHAR(50) NOT NULL,
  full_name VARCHAR(200) NOT NULL DEFAULT '',
  second_name VARCHAR(200) NOT NULL DEFAULT '',
  last_name VARCHAR(200) NOT NULL DEFAULT '',
  type VARCHAR(20) NOT NULL DEFAULT 'alumno',
  gender VARCHAR(20) NOT NULL DEFAULT '',
  turn VARCHAR(50) NOT NULL DEFAULT '',
  career VARCHAR(200) NOT NULL DEFAULT '',
  image_url VARCHAR(500) NOT NULL DEFAULT '',
  medical_certificate VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_students_code (student_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: attendance (asistencia / entradas y salidas)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_code VARCHAR(50) NOT NULL,
  full_name VARCHAR(200) NOT NULL DEFAULT '',
  user_type VARCHAR(20) NOT NULL DEFAULT '',
  check_in DATETIME NULL,
  check_out DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_attendance_student_code (student_code),
  KEY idx_attendance_check_in (check_in)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: settings (configuracion de reglamento, horarios y URLs de PDFs)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  setting_key VARCHAR(100) NOT NULL,
  setting_value LONGTEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_settings_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabla: users (usuarios administradores)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(100) NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'admin',
  scope_values VARCHAR(2000) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Cuentas de administrador iniciales.
-- Las contrasenas se guardan EN TEXTO PLANO a proposito (el admin las consulta
-- directamente en MySQL). El login acepta texto plano y bcrypt por compatibilidad.
-- Solo se insertan si el nombre de usuario no existe (INSERT IGNORE).
-- ----------------------------------------------------------------------------
INSERT IGNORE INTO users (username, password, role, active) VALUES
  ('super_admin', 'admin123', 'super_admin', 1),
  ('admin', 'admin123', 'admin', 1),
  ('matutino', 'admin123', 'admin_matutino', 1),
  ('vespertino', 'admin123', 'admin_vespertino', 1),
  ('jefecarrera', 'admin123', 'jefe_carrera', 1),
  ('administradorgym', 'admin123', 'administrador_gym', 1);

-- ----------------------------------------------------------------------------
-- Datos iniciales (se insertan solo si no existen)
-- ----------------------------------------------------------------------------
INSERT INTO settings (setting_key, setting_value)
SELECT 'reglamento',
       'REGLAMENTO DEL GIMNASIO UES\n\n1. Presentarse con una identificacion valida.\n2. Usar el uniforme correspondiente.\n3. El uso del gimnasio es exclusivo para miembros registrados.\n4. Mantener limpio el area de trabajo.'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE setting_key = 'reglamento');

INSERT INTO settings (setting_key, setting_value)
SELECT 'horarios',
       'HORARIOS DEL GIMNASIO UES\n\nLunes a Viernes: 6:00 AM - 8:00 PM\nSabado: 7:00 AM - 4:00 PM\nDomingo: Cerrado'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE setting_key = 'horarios');