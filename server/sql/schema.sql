CREATE DATABASE IF NOT EXISTS shared_expenses;
USE shared_expenses;

-- Users table (both registered and guest members)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    is_guest BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Groups table
CREATE TABLE IF NOT EXISTS `groups` (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    default_currency VARCHAR(3) DEFAULT 'INR',
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Group memberships with temporal tracking (join/leave dates)
CREATE TABLE IF NOT EXISTS group_memberships (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    user_id INT NOT NULL,
    joined_at DATE NOT NULL,
    left_at DATE DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE KEY unique_membership (group_id, user_id, joined_at)
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    description VARCHAR(255) NOT NULL,
    paid_by INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    split_type ENUM('equal', 'unequal', 'percentage', 'share') NOT NULL,
    expense_date DATE NOT NULL,
    notes TEXT,
    is_settlement BOOLEAN DEFAULT FALSE,
    import_row INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
    FOREIGN KEY (paid_by) REFERENCES users(id)
);

-- Expense splits (who owes what for each expense)
CREATE TABLE IF NOT EXISTS expense_splits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    expense_id INT NOT NULL,
    user_id INT NOT NULL,
    owed_amount DECIMAL(12,2) NOT NULL,
    share_value DECIMAL(10,4) DEFAULT NULL,
    percentage_value DECIMAL(5,2) DEFAULT NULL,
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Settlements (direct payments between users)
CREATE TABLE IF NOT EXISTS settlements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    from_user INT NOT NULL,
    to_user INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    settlement_date DATE NOT NULL,
    notes TEXT,
    import_row INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
    FOREIGN KEY (from_user) REFERENCES users(id),
    FOREIGN KEY (to_user) REFERENCES users(id)
);

-- Exchange rates
CREATE TABLE IF NOT EXISTS exchange_rates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    from_currency VARCHAR(3) NOT NULL,
    to_currency VARCHAR(3) NOT NULL,
    rate DECIMAL(10,4) NOT NULL,
    effective_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_rate (from_currency, to_currency, effective_date)
);

-- Import reports (tracks each CSV import)
CREATE TABLE IF NOT EXISTS import_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    imported_by INT NOT NULL,
    filename VARCHAR(255),
    total_rows INT DEFAULT 0,
    processed_rows INT DEFAULT 0,
    skipped_rows INT DEFAULT 0,
    anomaly_count INT DEFAULT 0,
    summary_json JSON,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
    FOREIGN KEY (imported_by) REFERENCES users(id)
);

-- Import anomalies (individual problems found during import)
CREATE TABLE IF NOT EXISTS import_anomalies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    import_report_id INT NOT NULL,
    `row_number` INT NOT NULL,
    anomaly_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) DEFAULT 'warning',
    description TEXT NOT NULL,
    original_data JSON,
    suggested_fix TEXT,
    action VARCHAR(20) DEFAULT 'pending',
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (import_report_id) REFERENCES import_reports(id) ON DELETE CASCADE
);

-- Seed default exchange rate: 1 USD = 95.11 INR
INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_date)
VALUES ('USD', 'INR', 95.11, '2026-01-01')
ON DUPLICATE KEY UPDATE rate = 95.11;
