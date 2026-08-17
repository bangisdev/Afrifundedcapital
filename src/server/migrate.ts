import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { ensureSystemRoles } from "./lib/rbac";

/**
 * Run all table creation migrations on startup.
 * Uses raw SQL so it works without drizzle-kit CLI.
 */
export function runMigrations(sqlite: Database.Database) {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    -- ═══════════════════════════════════════════
    -- Better Auth: users (extended)
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT UNIQUE,
      email_verified INTEGER DEFAULT 0,
      image TEXT,
      is_anonymous INTEGER DEFAULT 0,
      role TEXT DEFAULT 'user',
      phone TEXT,
      address TEXT,
      country TEXT,
      trading_experience TEXT,
      timezone TEXT,
      date_of_birth TEXT,
      kyc_status TEXT DEFAULT 'unverified',
      kyc_verified_at INTEGER,
      two_factor_enabled INTEGER DEFAULT 0,
      two_factor_secret TEXT,
      account_locked_until INTEGER,
      login_attempts INTEGER DEFAULT 0,
      referral_code TEXT UNIQUE,
      referred_by INTEGER,
      email_notifications INTEGER DEFAULT 1,
      notification_preferences TEXT,
      onboarding_complete INTEGER DEFAULT 0,
      is_demo_seeded INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_kyc ON users(kyc_status);
    CREATE INDEX IF NOT EXISTS idx_users_ref_code ON users(referral_code);

    -- ═══════════════════════════════════════════
    -- Better Auth: sessions
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL,
      device_info TEXT,
      ip_address TEXT,
      last_active_at INTEGER,
      expires_at INTEGER NOT NULL,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

    -- ═══════════════════════════════════════════
    -- Better Auth: accounts (required by better-auth)
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      provider_user_id TEXT,
      password TEXT,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      access_token_expires_at INTEGER,
      refresh_token_expires_at INTEGER,
      scope TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

    -- ═══════════════════════════════════════════
    -- Better Auth: verifications
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS verifications (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER,
      updated_at INTEGER
    );

    -- ═══════════════════════════════════════════
    -- Login History
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS login_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      ip_address TEXT,
      device_info TEXT,
      location TEXT,
      success INTEGER NOT NULL,
      failed_reason TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON login_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_login_history_ts ON login_history(timestamp);

    -- ═══════════════════════════════════════════
    -- Audit Logs
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity);

    -- ═══════════════════════════════════════════
    -- Settings
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      "group" TEXT NOT NULL,
      description TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
    CREATE INDEX IF NOT EXISTS idx_settings_group ON settings("group");

    -- ═══════════════════════════════════════════
    -- Notifications
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      read INTEGER DEFAULT 0,
      link TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notif_user_read ON notifications(user_id, read);
    CREATE INDEX IF NOT EXISTS idx_notif_user_ts ON notifications(user_id, created_at);

    -- ═══════════════════════════════════════════
    -- KYC Documents
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS kyc_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      document_type TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_hash TEXT,
      status TEXT DEFAULT 'unverified',
      reviewed_by INTEGER,
      reviewed_at INTEGER,
      rejection_reason TEXT,
      notes TEXT,
      uploaded_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_kyc_user_id ON kyc_documents(user_id);
    CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_documents(status);
    CREATE INDEX IF NOT EXISTS idx_kyc_user_status ON kyc_documents(user_id, status);

    -- ═══════════════════════════════════════════
    -- Challenge Templates
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS challenge_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      profit_target REAL NOT NULL,
      daily_drawdown REAL NOT NULL,
      max_drawdown REAL NOT NULL,
      max_leverage INTEGER NOT NULL,
      min_trading_days INTEGER NOT NULL,
      max_trading_days INTEGER,
      max_position_size REAL,
      consistency_target REAL,
      allow_weekend_holding INTEGER DEFAULT 0,
      allow_news_trading INTEGER DEFAULT 1,
      allow_ea_trading INTEGER DEFAULT 1,
      allow_copy_trading INTEGER DEFAULT 0,
      news_blackout_before_minutes INTEGER,
      news_blackout_after_minutes INTEGER,
      price REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'NGN',
      duration_days INTEGER NOT NULL,
      reset_fee REAL,
      extension_fee REAL,
      scaling_plan TEXT,
      max_account_size REAL,
      created_by INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ct_type ON challenge_templates(type);
    CREATE INDEX IF NOT EXISTS idx_ct_active ON challenge_templates(is_active);

    -- ═══════════════════════════════════════════
    -- Account Sizes
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS account_sizes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      size REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'NGN',
      template_id INTEGER NOT NULL,
      price REAL NOT NULL,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_as_template ON account_sizes(template_id);
    CREATE INDEX IF NOT EXISTS idx_as_active ON account_sizes(is_active);

    -- ═══════════════════════════════════════════
    -- User Challenges
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS user_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      template_id INTEGER NOT NULL,
      account_size_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      account_size REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'NGN',
      profit_target REAL NOT NULL,
      daily_drawdown REAL NOT NULL,
      max_drawdown REAL NOT NULL,
      max_leverage INTEGER NOT NULL,
      min_trading_days INTEGER NOT NULL,
      max_trading_days INTEGER,
      started_at INTEGER,
      phase_1_passed_at INTEGER,
      phase_2_passed_at INTEGER,
      funded_at INTEGER,
      expires_at INTEGER,
      payment_id INTEGER,
      amount_paid REAL NOT NULL,
      violations TEXT,
      mt5_account_id INTEGER,
      current_phase INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_uc_user ON user_challenges(user_id);
    CREATE INDEX IF NOT EXISTS idx_uc_status ON user_challenges(status);
    CREATE INDEX IF NOT EXISTS idx_uc_template ON user_challenges(template_id);
    CREATE INDEX IF NOT EXISTS idx_uc_user_status ON user_challenges(user_id, status);

    -- ═══════════════════════════════════════════
    -- Funded Accounts
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS funded_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      challenge_id INTEGER NOT NULL,
      mt5_account_id INTEGER NOT NULL,
      account_size REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'NGN',
      profit_share_percent REAL NOT NULL,
      is_active INTEGER DEFAULT 1,
      activated_at INTEGER NOT NULL,
      terminated_at INTEGER,
      termination_reason TEXT,
      total_payouts REAL DEFAULT 0,
      last_payout_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_fa_user ON funded_accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_fa_challenge ON funded_accounts(challenge_id);
    CREATE INDEX IF NOT EXISTS idx_fa_active ON funded_accounts(is_active);

    -- ═══════════════════════════════════════════
    -- MT5 Accounts
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS mt5_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      login TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      investor_password TEXT NOT NULL,
      server TEXT NOT NULL DEFAULT 'AfriFundedCapital-Demo',
      "group" TEXT NOT NULL DEFAULT 'DEMO\\\\AFC',
      leverage INTEGER NOT NULL DEFAULT 100,
      balance REAL NOT NULL DEFAULT 0,
      equity REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'NGN',
      is_active INTEGER DEFAULT 1,
      is_suspended INTEGER DEFAULT 0,
      last_sync_at INTEGER,
      created_at INTEGER NOT NULL,
      metadata TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_mt5_user ON mt5_accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_mt5_active ON mt5_accounts(is_active);
    CREATE INDEX IF NOT EXISTS idx_mt5_login ON mt5_accounts(login);

    -- ═══════════════════════════════════════════
    -- Trading Metrics
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS trading_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mt5_account_id INTEGER NOT NULL,
      challenge_id INTEGER NOT NULL,
      balance REAL NOT NULL,
      equity REAL NOT NULL,
      floating_pl REAL NOT NULL,
      daily_pl REAL NOT NULL,
      total_profit REAL NOT NULL,
      current_drawdown REAL NOT NULL,
      daily_drawdown REAL NOT NULL,
      trailing_drawdown REAL NOT NULL,
      relative_drawdown REAL NOT NULL,
      absolute_drawdown REAL NOT NULL,
      remaining_drawdown REAL NOT NULL,
      profit_target_progress REAL NOT NULL,
      trading_days_count INTEGER NOT NULL,
      open_positions INTEGER NOT NULL,
      closed_trades INTEGER NOT NULL,
      win_rate REAL,
      loss_rate REAL,
      average_rr REAL,
      profit_factor REAL,
      expectancy REAL,
      largest_win REAL,
      largest_loss REAL,
      consecutive_wins INTEGER,
      consecutive_losses INTEGER,
      risk_score REAL,
      health_score REAL,
      recorded_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tm_mt5 ON trading_metrics(mt5_account_id);
    CREATE INDEX IF NOT EXISTS idx_tm_challenge ON trading_metrics(challenge_id);
    CREATE INDEX IF NOT EXISTS idx_tm_recorded ON trading_metrics(recorded_at);

    -- ═══════════════════════════════════════════
    -- Drawdown History
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS drawdown_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge_id INTEGER NOT NULL,
      mt5_account_id INTEGER NOT NULL,
      balance REAL NOT NULL,
      equity REAL NOT NULL,
      drawdown REAL NOT NULL,
      daily_drawdown REAL NOT NULL,
      peak_balance REAL NOT NULL,
      recorded_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_dd_challenge ON drawdown_history(challenge_id);
    CREATE INDEX IF NOT EXISTS idx_dd_mt5 ON drawdown_history(mt5_account_id, recorded_at);

    -- ═══════════════════════════════════════════
    -- Payments
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'NGN',
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reference TEXT NOT NULL UNIQUE,
      description TEXT,
      metadata TEXT,
      challenge_id INTEGER,
      template_id INTEGER,
      account_size_id INTEGER,
      invoice_url TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_pay_user ON payments(user_id);
    CREATE INDEX IF NOT EXISTS idx_pay_ref ON payments(reference);
    CREATE INDEX IF NOT EXISTS idx_pay_status ON payments(status);
    CREATE INDEX IF NOT EXISTS idx_pay_provider ON payments(provider);

    -- ═══════════════════════════════════════════
    -- Payment Logs
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS payment_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      event TEXT NOT NULL,
      data TEXT,
      ip_address TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pl_payment ON payment_logs(payment_id);
    CREATE INDEX IF NOT EXISTS idx_pl_event ON payment_logs(event);

    -- ═══════════════════════════════════════════
    -- Flutterwave Transactions
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS flutterwave_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL,
      transaction_id TEXT NOT NULL,
      flw_ref TEXT NOT NULL,
      status TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      charged_amount REAL NOT NULL,
      processor_response TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_name TEXT,
      payment_type TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      verified_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_flw_payment ON flutterwave_transactions(payment_id);
    CREATE INDEX IF NOT EXISTS idx_flw_tx_id ON flutterwave_transactions(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_flw_ref ON flutterwave_transactions(flw_ref);

    -- ═══════════════════════════════════════════
    -- Paystack Transactions
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS paystack_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL,
      reference TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      status TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      fees REAL,
      customer_email TEXT NOT NULL,
      authorization TEXT,
      created_at INTEGER NOT NULL,
      verified_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_pst_payment ON paystack_transactions(payment_id);
    CREATE INDEX IF NOT EXISTS idx_pst_ref ON paystack_transactions(reference);

    -- ═══════════════════════════════════════════
    -- Wallets
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      balance REAL NOT NULL DEFAULT 0,
      referral_balance REAL NOT NULL DEFAULT 0,
      bonus_balance REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'NGN',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_wallet_user ON wallets(user_id);

    -- ═══════════════════════════════════════════
    -- Wallet Transactions
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      balance_before REAL NOT NULL,
      balance_after REAL NOT NULL,
      description TEXT NOT NULL,
      reference TEXT,
      payment_id INTEGER,
      metadata TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_wtx_wallet ON wallet_transactions(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_wtx_user ON wallet_transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_wtx_type ON wallet_transactions(type);
    CREATE INDEX IF NOT EXISTS idx_wtx_created ON wallet_transactions(created_at);

    -- ═══════════════════════════════════════════
    -- Affiliates
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS affiliates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      referral_code TEXT NOT NULL UNIQUE,
      total_referrals INTEGER NOT NULL DEFAULT 0,
      active_referrals INTEGER NOT NULL DEFAULT 0,
      total_commissions REAL NOT NULL DEFAULT 0,
      pending_commissions REAL NOT NULL DEFAULT 0,
      paid_commissions REAL NOT NULL DEFAULT 0,
      commission_rate REAL NOT NULL DEFAULT 0.1,
      commission_levels INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      joined_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_aff_user ON affiliates(user_id);
    CREATE INDEX IF NOT EXISTS idx_aff_code ON affiliates(referral_code);

    -- ═══════════════════════════════════════════
    -- Referrals
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id INTEGER NOT NULL,
      referred_id INTEGER NOT NULL UNIQUE,
      affiliate_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      commission_earned REAL,
      converted_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ref_referrer ON referrals(referrer_id);
    CREATE INDEX IF NOT EXISTS idx_ref_referred ON referrals(referred_id);
    CREATE INDEX IF NOT EXISTS idx_ref_status ON referrals(status);

    -- ═══════════════════════════════════════════
    -- Commissions
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS commissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      affiliate_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      referral_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      paid_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_comm_affiliate ON commissions(affiliate_id);
    CREATE INDEX IF NOT EXISTS idx_comm_user ON commissions(user_id);
    CREATE INDEX IF NOT EXISTS idx_comm_status ON commissions(status);

    -- ═══════════════════════════════════════════
    -- Commission Payouts
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS commission_payouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      affiliate_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'NGN',
      status TEXT NOT NULL DEFAULT 'pending',
      payment_method TEXT,
      payment_details TEXT,
      processed_by INTEGER,
      notes TEXT,
      requested_at INTEGER NOT NULL,
      processed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_cp_user ON commission_payouts(user_id);
    CREATE INDEX IF NOT EXISTS idx_cp_status ON commission_payouts(status);

    -- ═══════════════════════════════════════════
    -- Profit Payouts
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS profit_payouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      funded_account_id INTEGER NOT NULL,
      challenge_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'NGN',
      status TEXT NOT NULL DEFAULT 'pending',
      payment_method TEXT NOT NULL,
      payment_details TEXT NOT NULL,
      processed_by INTEGER,
      notes TEXT,
      rejection_reason TEXT,
      requested_at INTEGER NOT NULL,
      processed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_pp_user ON profit_payouts(user_id);
    CREATE INDEX IF NOT EXISTS idx_pp_status ON profit_payouts(status);
    CREATE INDEX IF NOT EXISTS idx_pp_funding ON profit_payouts(funded_account_id);
    CREATE INDEX IF NOT EXISTS idx_pp_challenge ON profit_payouts(challenge_id);

    -- ═══════════════════════════════════════════
    -- Coupons
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      discount_type TEXT NOT NULL,
      discount_value REAL NOT NULL,
      min_purchase_amount REAL,
      max_uses INTEGER,
      current_uses INTEGER NOT NULL DEFAULT 0,
      max_uses_per_user INTEGER,
      is_active INTEGER DEFAULT 1,
      expires_at INTEGER,
      description TEXT,
      template_ids TEXT,
      created_by INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_coupon_code ON coupons(code);
    CREATE INDEX IF NOT EXISTS idx_coupon_active ON coupons(is_active);

    -- ═══════════════════════════════════════════
    -- Coupon Redemptions
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS coupon_redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coupon_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      payment_id INTEGER NOT NULL,
      discount_amount REAL NOT NULL,
      original_amount REAL NOT NULL,
      redeemed_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cr_coupon ON coupon_redemptions(coupon_id);
    CREATE INDEX IF NOT EXISTS idx_cr_user ON coupon_redemptions(user_id);

    -- ═══════════════════════════════════════════
    -- Certificates
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      challenge_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      certificate_number TEXT NOT NULL UNIQUE,
      verification_code TEXT NOT NULL UNIQUE,
      certificate_url TEXT,
      issued_at INTEGER NOT NULL,
      issued_by INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_cert_user ON certificates(user_id);
    CREATE INDEX IF NOT EXISTS idx_cert_challenge ON certificates(challenge_id);
    CREATE INDEX IF NOT EXISTS idx_cert_number ON certificates(certificate_number);
    CREATE INDEX IF NOT EXISTS idx_cert_verification ON certificates(verification_code);

    -- ═══════════════════════════════════════════
    -- Certificate Verifications
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS certificate_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      certificate_id INTEGER NOT NULL,
      verified_by INTEGER,
      ip_address TEXT,
      verified_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cv_certificate ON certificate_verifications(certificate_id);

    -- ═══════════════════════════════════════════
    -- Support Tickets
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'open',
      assigned_to INTEGER,
      attachments TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      resolved_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_st_user ON support_tickets(user_id);
    CREATE INDEX IF NOT EXISTS idx_st_status ON support_tickets(status);
    CREATE INDEX IF NOT EXISTS idx_st_assigned ON support_tickets(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_st_priority ON support_tickets(priority);

    -- ═══════════════════════════════════════════
    -- Support Ticket Messages
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS support_ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      is_internal INTEGER DEFAULT 0,
      attachments TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_stm_ticket ON support_ticket_messages(ticket_id, created_at);

    -- ═══════════════════════════════════════════
    -- Roles
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      permissions TEXT NOT NULL,
      is_system INTEGER DEFAULT 0,
      parent_role_id INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_role_name ON roles(name);

    -- ═══════════════════════════════════════════
    -- User Roles
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS user_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL,
      assigned_by INTEGER NOT NULL,
      assigned_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ur_user ON user_roles(user_id);
    CREATE INDEX IF NOT EXISTS idx_ur_role ON user_roles(role_id);

    -- ═══════════════════════════════════════════
    -- Activity Logs
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      activity TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_al_user ON activity_logs(user_id, timestamp);

    -- ═══════════════════════════════════════════
    -- MT5 Reconciliation Log
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS mt5_reconciliation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenge_id INTEGER NOT NULL,
      mt5_account_id INTEGER NOT NULL,
      login TEXT NOT NULL,
      status TEXT NOT NULL,
      server_balance REAL NOT NULL DEFAULT 0,
      server_equity REAL NOT NULL DEFAULT 0,
      local_balance REAL NOT NULL DEFAULT 0,
      local_equity REAL NOT NULL DEFAULT 0,
      difference REAL NOT NULL DEFAULT 0,
      tolerance REAL NOT NULL DEFAULT 0.01,
      source TEXT NOT NULL,
      detail TEXT,
      recorded_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mrec_challenge ON mt5_reconciliation(challenge_id);
    CREATE INDEX IF NOT EXISTS idx_mrec_mt5 ON mt5_reconciliation(mt5_account_id);
    CREATE INDEX IF NOT EXISTS idx_mrec_recorded ON mt5_reconciliation(recorded_at);

    -- ═══════════════════════════════════════════
    -- MT5 Sync Queue
    -- ═══════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS mt5_sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mt5_account_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payload TEXT,
      error TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      created_at INTEGER NOT NULL,
      processed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_msq_mt5 ON mt5_sync_queue(mt5_account_id);
    CREATE INDEX IF NOT EXISTS idx_msq_status ON mt5_sync_queue(status);
  `);

  // ─── Column migrations for pre-existing databases ──────────────────
  // CREATE TABLE IF NOT EXISTS never alters existing tables, so any column
  // added after a deployment must be applied explicitly. SQLite lacks
  // "ADD COLUMN IF NOT EXISTS", so guard each one via PRAGMA table_info.
  const existingUserColumns = new Set(
    (sqlite.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>).map((c) => c.name),
  );
  const addUserColumn = (name: string, ddl: string) => {
    if (existingUserColumns.has(name)) return;
    try {
      sqlite.exec(`ALTER TABLE users ADD COLUMN ${ddl}`);
      console.log(`[DB] Added users.${name} column`);
    } catch (e) {
      console.warn(`[DB] Could not add users.${name}:`, e);
    }
  };
  addUserColumn("email_verification_token", "email_verification_token TEXT");
  addUserColumn("email_verification_expires_at", "email_verification_expires_at INTEGER");
  addUserColumn("reset_password_token", "reset_password_token TEXT");
  addUserColumn("reset_password_expires_at", "reset_password_expires_at INTEGER");
  addUserColumn("two_factor_backup_codes", "two_factor_backup_codes TEXT");

  // challenge_templates: news blackout window (minutes before/after high-
  // impact events) — same guarded ADD COLUMN pattern as the users columns.
  const existingTemplateColumns = new Set(
    (sqlite.prepare("PRAGMA table_info(challenge_templates)").all() as Array<{ name: string }>).map((c) => c.name),
  );
  const addTemplateColumn = (name: string, ddl: string) => {
    if (existingTemplateColumns.has(name)) return;
    try {
      sqlite.exec(`ALTER TABLE challenge_templates ADD COLUMN ${ddl}`);
      console.log(`[DB] Added challenge_templates.${name} column`);
    } catch (e) {
      console.warn(`[DB] Could not add challenge_templates.${name}:`, e);
    }
  };
  addTemplateColumn("news_blackout_before_minutes", "news_blackout_before_minutes INTEGER");
  addTemplateColumn("news_blackout_after_minutes", "news_blackout_after_minutes INTEGER");

  console.log("[DB] All tables created/verified successfully.");

  scrubStoredSecrets(sqlite);

  // Seed the built-in RBAC system roles (idempotent).
  try {
    ensureSystemRoles(drizzle(sqlite, { schema }));
  } catch (e) {
    console.warn("[Migrate] Failed to seed system roles:", e);
  }
}

// Field names that must never be persisted in the settings table: API keys,
// payment gateway secrets, webhook hashes, passwords, tokens.
const SECRET_SETTING_FIELD = /secret|password|token|hash|api[_ -]?key|private/i;

/**
 * Security scrub: remove secret material from the settings table at boot.
 *
 * API keys and gateway secrets must live in environment variables, never in
 * the database (the DB files previously ended up in git history, which is how
 * the Resend key was exposed). This deletes any legacy secret fields from
 * existing rows so the DB can never serve or re-leak them.
 */
export function scrubStoredSecrets(sqlite: Database.Database): void {
  try {
    const rows = sqlite
      .prepare("SELECT id, key, value FROM settings")
      .all() as Array<{ id: number; key: string; value: string }>;
    let scrubbed = 0;
    for (const row of rows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.value);
      } catch {
        continue; // non-JSON scalar setting — nothing to scrub
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;

      const cfg = parsed as Record<string, unknown>;
      let changed = false;
      for (const field of Object.keys(cfg)) {
        if (SECRET_SETTING_FIELD.test(field) && typeof cfg[field] === "string" && cfg[field] !== "") {
          delete cfg[field];
          changed = true;
        }
      }
      if (changed) {
        sqlite.prepare("UPDATE settings SET value = ? WHERE id = ?").run(JSON.stringify(cfg), row.id);
        scrubbed++;
        console.log(`[DB] Scrubbed secret field(s) from settings key '${row.key}'`);
      }
    }
    if (scrubbed > 0) {
      console.log(`[DB] Secret scrub complete — ${scrubbed} setting(s) sanitized`);
    }
  } catch (e) {
    console.warn("[DB] Secret scrub skipped:", e);
  }
}
