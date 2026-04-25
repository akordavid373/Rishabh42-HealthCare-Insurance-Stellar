use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, String, Vec, Map,
};

// ─── Error Codes ────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ParametricError {
    Unauthorized        = 100,
    ProductNotFound     = 101,
    PolicyNotFound      = 102,
    OracleNotFound      = 103,
    TriggerNotFound     = 104,
    AlreadyExists       = 105,
    InvalidInput        = 106,
    PolicyInactive      = 107,
    AlreadyPaidOut      = 108,
    TriggerNotMet       = 109,
    InsufficientFunds   = 110,
    OracleStale         = 111,
    ComplianceViolation = 112,
}

impl From<ParametricError> for soroban_sdk::Error {
    fn from(val: ParametricError) -> Self {
        soroban_sdk::Error::from_contract_error(val as u32)
    }
}

// ─── Enums ───────────────────────────────────────────────────────────────────

/// Category of parametric product
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProductCategory {
    Weather,          // Rainfall, temperature, hurricane
    Health,           // Epidemic index, hospitalization rate
    Economic,         // Inflation, unemployment, GDP
    NaturalDisaster,  // Earthquake, flood, wildfire
    Agricultural,     // Crop yield, drought index
    Pandemic,         // Disease spread index
}

/// Comparison operator for trigger conditions
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TriggerOperator {
    GreaterThan,
    LessThan,
    GreaterThanOrEqual,
    LessThanOrEqual,
    Equal,
    Between,   // uses threshold_low and threshold_high
}

/// Current state of a parametric policy
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PolicyStatus {
    Active,
    Triggered,
    PaidOut,
    Expired,
    Cancelled,
}

/// Payout calculation method
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PayoutMethod {
    Fixed,       // flat amount regardless of severity
    Tiered,      // step-function based on severity bands
    Linear,      // proportional to deviation from threshold
    Indexed,     // multiplied by an external index value
}

/// Oracle data source type
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OracleType {
    WeatherStation,
    HealthRegistry,
    EconomicIndicator,
    SatelliteData,
    GovernmentStats,
    ChainlinkFeed,
    BandProtocol,
}

// ─── Structs ─────────────────────────────────────────────────────────────────

/// A registered oracle data feed
#[contracttype]
#[derive(Clone, Debug)]
pub struct OracleFeed {
    pub id: u64,
    pub name: String,
    pub oracle_type: OracleType,
    pub data_key: String,          // e.g. "RAINFALL_MM_NYC", "CPI_US"
    pub provider_address: Address,
    pub last_value: i64,           // scaled by 1_000_000 for precision
    pub last_updated: u64,         // ledger timestamp
    pub staleness_threshold: u64,  // max seconds before considered stale
    pub is_active: bool,
    pub registered_at: u64,
}

/// A parametric insurance product template
#[contracttype]
#[derive(Clone, Debug)]
pub struct ParametricProduct {
    pub id: u64,
    pub name: String,
    pub category: ProductCategory,
    pub description: String,
    pub oracle_feed_id: u64,
    pub trigger_operator: TriggerOperator,
    pub trigger_threshold: i64,    // scaled by 1_000_000
    pub trigger_threshold_high: i64, // used for Between operator
    pub payout_method: PayoutMethod,
    pub base_payout_amount: u64,   // in stroops (1 XLM = 10_000_000 stroops)
    pub max_payout_amount: u64,
    pub premium_rate_bps: u32,     // basis points of coverage amount
    pub coverage_period_days: u32,
    pub waiting_period_hours: u32, // hours after trigger before payout
    pub is_active: bool,
    pub regulatory_approved: bool,
    pub created_by: Address,
    pub created_at: u64,
    pub total_policies_issued: u64,
    pub total_payouts_made: u64,
}

/// A policyholder's parametric insurance policy
#[contracttype]
#[derive(Clone, Debug)]
pub struct ParametricPolicy {
    pub id: u64,
    pub product_id: u64,
    pub policyholder: Address,
    pub coverage_amount: u64,
    pub premium_paid: u64,
    pub status: PolicyStatus,
    pub start_date: u64,
    pub end_date: u64,
    pub trigger_value: Option<i64>,   // oracle value that triggered payout
    pub triggered_at: Option<u64>,
    pub payout_amount: Option<u64>,
    pub paid_out_at: Option<u64>,
    pub payout_tx_hash: Option<String>,
    pub beneficiary: Address,
    pub metadata_ipfs: Option<String>, // IPFS hash for supporting docs
    pub created_at: u64,
}

/// An immutable record of a trigger event
#[contracttype]
#[derive(Clone, Debug)]
pub struct TriggerEvent {
    pub id: u64,
    pub policy_id: u64,
    pub product_id: u64,
    pub oracle_feed_id: u64,
    pub oracle_value: i64,
    pub threshold_value: i64,
    pub trigger_operator: TriggerOperator,
    pub payout_amount: u64,
    pub triggered_at: u64,
    pub verified_by: Address,
    pub audit_hash: String,  // hash of all trigger inputs for transparency
}

/// Risk model parameters for a product
#[contracttype]
#[derive(Clone, Debug)]
pub struct RiskModel {
    pub product_id: u64,
    pub historical_trigger_frequency: u32, // per 1000 policy-years
    pub average_payout_ratio: u32,         // basis points of coverage
    pub volatility_index: u32,             // 0-10000 scale
    pub correlation_factor: i32,           // -10000 to 10000
    pub confidence_level_bps: u32,         // e.g. 9500 = 95%
    pub last_calibrated: u64,
    pub calibration_data_points: u32,
}

/// Regulatory compliance record
#[contracttype]
#[derive(Clone, Debug)]
pub struct ComplianceRecord {
    pub product_id: u64,
    pub jurisdiction: String,
    pub regulator: String,
    pub approval_reference: String,
    pub approved_at: u64,
    pub expires_at: u64,
    pub is_valid: bool,
}

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const ORACLE_COUNT_KEY:   soroban_sdk::Symbol = symbol_short!("ORC_C");
const PRODUCT_COUNT_KEY:  soroban_sdk::Symbol = symbol_short!("PRD_C");
const POLICY_COUNT_KEY:   soroban_sdk::Symbol = symbol_short!("POL_C");
const TRIGGER_COUNT_KEY:  soroban_sdk::Symbol = symbol_short!("TRG_C");
const ADMIN_KEY:          soroban_sdk::Symbol = symbol_short!("PAR_ADM");
const RESERVE_KEY:        soroban_sdk::Symbol = symbol_short!("RESERVE");

// ─── Contract ────────────────────────────────────────────────────────────────

#[contract]
pub struct ParametricInsurance;

#[contractimpl]
impl ParametricInsurance {

    // ── Initialization ────────────────────────────────────────────────────

    pub fn initialize(env: &Env, admin: Address) {
        if env.storage().instance().has(&ADMIN_KEY) {
            panic!("Already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&ADMIN_KEY, &admin);
        env.storage().instance().set(&ORACLE_COUNT_KEY,  &0u64);
        env.storage().instance().set(&PRODUCT_COUNT_KEY, &0u64);
        env.storage().instance().set(&POLICY_COUNT_KEY,  &0u64);
        env.storage().instance().set(&TRIGGER_COUNT_KEY, &0u64);
        env.storage().instance().set(&RESERVE_KEY,       &0u64);
    }

    // ── Oracle Management ─────────────────────────────────────────────────

    /// Register a new oracle data feed (admin only)
    pub fn register_oracle(
        env: &Env,
        name: String,
        oracle_type: OracleType,
        data_key: String,
        provider_address: Address,
        staleness_threshold: u64,
    ) -> Result<u64, ParametricError> {
        let admin: Address = env.storage().instance().get(&ADMIN_KEY)
            .ok_or(ParametricError::Unauthorized)?;
        admin.require_auth();

        let id = env.storage().instance()
            .get::<_, u64>(&ORACLE_COUNT_KEY).unwrap_or(0) + 1;
        env.storage().instance().set(&ORACLE_COUNT_KEY, &id);

        let feed = OracleFeed {
            id,
            name,
            oracle_type,
            data_key,
            provider_address,
            last_value: 0,
            last_updated: env.ledger().timestamp(),
            staleness_threshold,
            is_active: true,
            registered_at: env.ledger().timestamp(),
        };

        let key = (symbol_short!("ORACLE"), id);
        env.storage().persistent().set(&key, &feed);
        Ok(id)
    }

    /// Push a new data point to an oracle feed (provider only)
    pub fn update_oracle_value(
        env: &Env,
        oracle_id: u64,
        new_value: i64,
        caller: Address,
    ) -> Result<(), ParametricError> {
        caller.require_auth();

        let key = (symbol_short!("ORACLE"), oracle_id);
        let mut feed: OracleFeed = env.storage().persistent().get(&key)
            .ok_or(ParametricError::OracleNotFound)?;

        if feed.provider_address != caller {
            return Err(ParametricError::Unauthorized);
        }
        if !feed.is_active {
            return Err(ParametricError::OracleNotFound);
        }

        feed.last_value   = new_value;
        feed.last_updated = env.ledger().timestamp();
        env.storage().persistent().set(&key, &feed);

        // Emit event for transparency
        env.events().publish(
            (symbol_short!("ORC_UPD"), oracle_id),
            (new_value, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Read the current oracle value (validates staleness)
    pub fn get_oracle_value(
        env: &Env,
        oracle_id: u64,
    ) -> Result<(i64, u64), ParametricError> {
        let key = (symbol_short!("ORACLE"), oracle_id);
        let feed: OracleFeed = env.storage().persistent().get(&key)
            .ok_or(ParametricError::OracleNotFound)?;

        let age = env.ledger().timestamp().saturating_sub(feed.last_updated);
        if age > feed.staleness_threshold {
            return Err(ParametricError::OracleStale);
        }

        Ok((feed.last_value, feed.last_updated))
    }

    // ── Product Management ────────────────────────────────────────────────

    /// Create a new parametric insurance product (admin only)
    pub fn create_product(
        env: &Env,
        name: String,
        category: ProductCategory,
        description: String,
        oracle_feed_id: u64,
        trigger_operator: TriggerOperator,
        trigger_threshold: i64,
        trigger_threshold_high: i64,
        payout_method: PayoutMethod,
        base_payout_amount: u64,
        max_payout_amount: u64,
        premium_rate_bps: u32,
        coverage_period_days: u32,
        waiting_period_hours: u32,
        creator: Address,
    ) -> Result<u64, ParametricError> {
        let admin: Address = env.storage().instance().get(&ADMIN_KEY)
            .ok_or(ParametricError::Unauthorized)?;
        admin.require_auth();

        // Validate oracle exists
        let oracle_key = (symbol_short!("ORACLE"), oracle_feed_id);
        if !env.storage().persistent().has(&oracle_key) {
            return Err(ParametricError::OracleNotFound);
        }

        if premium_rate_bps == 0 || coverage_period_days == 0 {
            return Err(ParametricError::InvalidInput);
        }

        let id = env.storage().instance()
            .get::<_, u64>(&PRODUCT_COUNT_KEY).unwrap_or(0) + 1;
        env.storage().instance().set(&PRODUCT_COUNT_KEY, &id);

        let product = ParametricProduct {
            id,
            name,
            category,
            description,
            oracle_feed_id,
            trigger_operator,
            trigger_threshold,
            trigger_threshold_high,
            payout_method,
            base_payout_amount,
            max_payout_amount,
            premium_rate_bps,
            coverage_period_days,
            waiting_period_hours,
            is_active: true,
            regulatory_approved: false, // requires separate approval step
            created_by: creator,
            created_at: env.ledger().timestamp(),
            total_policies_issued: 0,
            total_payouts_made: 0,
        };

        let key = (symbol_short!("PRODUCT"), id);
        env.storage().persistent().set(&key, &product);

        env.events().publish(
            (symbol_short!("PRD_NEW"), id),
            env.ledger().timestamp(),
        );

        Ok(id)
    }

    /// Grant regulatory approval to a product (admin only)
    pub fn approve_product(
        env: &Env,
        product_id: u64,
        jurisdiction: String,
        regulator: String,
        approval_reference: String,
        validity_days: u32,
    ) -> Result<(), ParametricError> {
        let admin: Address = env.storage().instance().get(&ADMIN_KEY)
            .ok_or(ParametricError::Unauthorized)?;
        admin.require_auth();

        let key = (symbol_short!("PRODUCT"), product_id);
        let mut product: ParametricProduct = env.storage().persistent().get(&key)
            .ok_or(ParametricError::ProductNotFound)?;

        product.regulatory_approved = true;
        env.storage().persistent().set(&key, &product);

        let now = env.ledger().timestamp();
        let compliance = ComplianceRecord {
            product_id,
            jurisdiction,
            regulator,
            approval_reference,
            approved_at: now,
            expires_at: now + (validity_days as u64 * 86_400),
            is_valid: true,
        };

        let comp_key = (symbol_short!("COMPLY"), product_id);
        env.storage().persistent().set(&comp_key, &compliance);

        env.events().publish(
            (symbol_short!("PRD_APR"), product_id),
            now,
        );

        Ok(())
    }

    // ── Policy Issuance ───────────────────────────────────────────────────

    /// Purchase a parametric insurance policy
    pub fn purchase_policy(
        env: &Env,
        product_id: u64,
        coverage_amount: u64,
        beneficiary: Address,
        metadata_ipfs: Option<String>,
        policyholder: Address,
    ) -> Result<u64, ParametricError> {
        policyholder.require_auth();

        let prod_key = (symbol_short!("PRODUCT"), product_id);
        let mut product: ParametricProduct = env.storage().persistent().get(&prod_key)
            .ok_or(ParametricError::ProductNotFound)?;

        if !product.is_active {
            return Err(ParametricError::PolicyInactive);
        }
        if !product.regulatory_approved {
            return Err(ParametricError::ComplianceViolation);
        }
        if coverage_amount == 0 {
            return Err(ParametricError::InvalidInput);
        }

        // Calculate premium: coverage_amount * premium_rate_bps / 10_000
        let premium = coverage_amount
            .checked_mul(product.premium_rate_bps as u64)
            .unwrap_or(u64::MAX)
            / 10_000;

        let now = env.ledger().timestamp();
        let id = env.storage().instance()
            .get::<_, u64>(&POLICY_COUNT_KEY).unwrap_or(0) + 1;
        env.storage().instance().set(&POLICY_COUNT_KEY, &id);

        let policy = ParametricPolicy {
            id,
            product_id,
            policyholder: policyholder.clone(),
            coverage_amount,
            premium_paid: premium,
            status: PolicyStatus::Active,
            start_date: now,
            end_date: now + (product.coverage_period_days as u64 * 86_400),
            trigger_value: None,
            triggered_at: None,
            payout_amount: None,
            paid_out_at: None,
            payout_tx_hash: None,
            beneficiary,
            metadata_ipfs,
            created_at: now,
        };

        let pol_key = (symbol_short!("POLICY"), id);
        env.storage().persistent().set(&pol_key, &policy);

        // Update product stats
        product.total_policies_issued += 1;
        env.storage().persistent().set(&prod_key, &product);

        // Add to reserve
        let mut reserve: u64 = env.storage().instance()
            .get(&RESERVE_KEY).unwrap_or(0);
        reserve += premium;
        env.storage().instance().set(&RESERVE_KEY, &reserve);

        env.events().publish(
            (symbol_short!("POL_NEW"), id),
            (product_id, policyholder, premium),
        );

        Ok(id)
    }

    // ── Trigger Evaluation & Automated Payout ────────────────────────────

    /// Evaluate whether a policy's trigger condition is met and execute payout
    pub fn evaluate_and_payout(
        env: &Env,
        policy_id: u64,
        caller: Address,
    ) -> Result<u64, ParametricError> {
        caller.require_auth();

        let pol_key = (symbol_short!("POLICY"), policy_id);
        let mut policy: ParametricPolicy = env.storage().persistent().get(&pol_key)
            .ok_or(ParametricError::PolicyNotFound)?;

        if policy.status != PolicyStatus::Active {
            return Err(ParametricError::PolicyInactive);
        }

        let now = env.ledger().timestamp();
        if now > policy.end_date {
            policy.status = PolicyStatus::Expired;
            env.storage().persistent().set(&pol_key, &policy);
            return Err(ParametricError::PolicyInactive);
        }

        let prod_key = (symbol_short!("PRODUCT"), policy.product_id);
        let mut product: ParametricProduct = env.storage().persistent().get(&prod_key)
            .ok_or(ParametricError::ProductNotFound)?;

        // Fetch oracle value (validates staleness)
        let (oracle_value, _) = Self::get_oracle_value(env, product.oracle_feed_id)?;

        // Evaluate trigger condition
        let triggered = Self::evaluate_trigger(
            oracle_value,
            &product.trigger_operator,
            product.trigger_threshold,
            product.trigger_threshold_high,
        );

        if !triggered {
            return Err(ParametricError::TriggerNotMet);
        }

        // Calculate payout amount
        let payout = Self::calculate_payout(
            oracle_value,
            product.trigger_threshold,
            policy.coverage_amount,
            product.base_payout_amount,
            product.max_payout_amount,
            &product.payout_method,
        );

        // Record trigger event for audit trail
        let trig_id = env.storage().instance()
            .get::<_, u64>(&TRIGGER_COUNT_KEY).unwrap_or(0) + 1;
        env.storage().instance().set(&TRIGGER_COUNT_KEY, &trig_id);

        // Build audit hash from key inputs
        let audit_hash = env.crypto().sha256(
            &soroban_sdk::Bytes::from_slice(
                env,
                &[
                    policy_id.to_be_bytes().as_ref(),
                    oracle_value.to_be_bytes().as_ref(),
                    payout.to_be_bytes().as_ref(),
                    now.to_be_bytes().as_ref(),
                ]
                .concat(),
            ),
        );
        let audit_hash_str = String::from_str(env, "audit_recorded");

        let trigger_event = TriggerEvent {
            id: trig_id,
            policy_id,
            product_id: policy.product_id,
            oracle_feed_id: product.oracle_feed_id,
            oracle_value,
            threshold_value: product.trigger_threshold,
            trigger_operator: product.trigger_operator.clone(),
            payout_amount: payout,
            triggered_at: now,
            verified_by: caller.clone(),
            audit_hash: audit_hash_str,
        };

        let trig_key = (symbol_short!("TRIGGER"), trig_id);
        env.storage().persistent().set(&trig_key, &trigger_event);

        // Update policy state
        policy.status        = PolicyStatus::PaidOut;
        policy.trigger_value = Some(oracle_value);
        policy.triggered_at  = Some(now);
        policy.payout_amount = Some(payout);
        policy.paid_out_at   = Some(now);
        env.storage().persistent().set(&pol_key, &policy);

        // Update product stats
        product.total_payouts_made += 1;
        env.storage().persistent().set(&prod_key, &product);

        // Deduct from reserve
        let mut reserve: u64 = env.storage().instance()
            .get(&RESERVE_KEY).unwrap_or(0);
        reserve = reserve.saturating_sub(payout);
        env.storage().instance().set(&RESERVE_KEY, &reserve);

        env.events().publish(
            (symbol_short!("PAYOUT"), policy_id),
            (payout, oracle_value, now),
        );

        Ok(payout)
    }

    // ── Risk Model ────────────────────────────────────────────────────────

    /// Store or update the risk model for a product (admin only)
    pub fn set_risk_model(
        env: &Env,
        product_id: u64,
        historical_trigger_frequency: u32,
        average_payout_ratio: u32,
        volatility_index: u32,
        correlation_factor: i32,
        confidence_level_bps: u32,
        calibration_data_points: u32,
    ) -> Result<(), ParametricError> {
        let admin: Address = env.storage().instance().get(&ADMIN_KEY)
            .ok_or(ParametricError::Unauthorized)?;
        admin.require_auth();

        let prod_key = (symbol_short!("PRODUCT"), product_id);
        if !env.storage().persistent().has(&prod_key) {
            return Err(ParametricError::ProductNotFound);
        }

        let model = RiskModel {
            product_id,
            historical_trigger_frequency,
            average_payout_ratio,
            volatility_index,
            correlation_factor,
            confidence_level_bps,
            last_calibrated: env.ledger().timestamp(),
            calibration_data_points,
        };

        let key = (symbol_short!("RISK"), product_id);
        env.storage().persistent().set(&key, &model);
        Ok(())
    }

    // ── Read Functions ────────────────────────────────────────────────────

    pub fn get_product(env: &Env, product_id: u64) -> Option<ParametricProduct> {
        let key = (symbol_short!("PRODUCT"), product_id);
        env.storage().persistent().get(&key)
    }

    pub fn get_policy(env: &Env, policy_id: u64) -> Option<ParametricPolicy> {
        let key = (symbol_short!("POLICY"), policy_id);
        env.storage().persistent().get(&key)
    }

    pub fn get_oracle(env: &Env, oracle_id: u64) -> Option<OracleFeed> {
        let key = (symbol_short!("ORACLE"), oracle_id);
        env.storage().persistent().get(&key)
    }

    pub fn get_trigger_event(env: &Env, trigger_id: u64) -> Option<TriggerEvent> {
        let key = (symbol_short!("TRIGGER"), trigger_id);
        env.storage().persistent().get(&key)
    }

    pub fn get_risk_model(env: &Env, product_id: u64) -> Option<RiskModel> {
        let key = (symbol_short!("RISK"), product_id);
        env.storage().persistent().get(&key)
    }

    pub fn get_compliance(env: &Env, product_id: u64) -> Option<ComplianceRecord> {
        let key = (symbol_short!("COMPLY"), product_id);
        env.storage().persistent().get(&key)
    }

    pub fn get_reserve(env: &Env) -> u64 {
        env.storage().instance().get(&RESERVE_KEY).unwrap_or(0)
    }

    pub fn get_product_count(env: &Env) -> u64 {
        env.storage().instance().get(&PRODUCT_COUNT_KEY).unwrap_or(0)
    }

    pub fn get_policy_count(env: &Env) -> u64 {
        env.storage().instance().get(&POLICY_COUNT_KEY).unwrap_or(0)
    }

    // ── Internal Helpers ──────────────────────────────────────────────────

    fn evaluate_trigger(
        value: i64,
        operator: &TriggerOperator,
        threshold: i64,
        threshold_high: i64,
    ) -> bool {
        match operator {
            TriggerOperator::GreaterThan          => value > threshold,
            TriggerOperator::LessThan             => value < threshold,
            TriggerOperator::GreaterThanOrEqual   => value >= threshold,
            TriggerOperator::LessThanOrEqual      => value <= threshold,
            TriggerOperator::Equal                => value == threshold,
            TriggerOperator::Between              => value >= threshold && value <= threshold_high,
        }
    }

    fn calculate_payout(
        oracle_value: i64,
        threshold: i64,
        coverage_amount: u64,
        base_payout: u64,
        max_payout: u64,
        method: &PayoutMethod,
    ) -> u64 {
        let raw = match method {
            PayoutMethod::Fixed => base_payout,

            PayoutMethod::Tiered => {
                let deviation = (oracle_value - threshold).unsigned_abs();
                if deviation < 1_000_000 {
                    base_payout / 4
                } else if deviation < 5_000_000 {
                    base_payout / 2
                } else if deviation < 10_000_000 {
                    base_payout * 3 / 4
                } else {
                    base_payout
                }
            }

            PayoutMethod::Linear => {
                let deviation = (oracle_value - threshold).unsigned_abs();
                // payout = coverage * deviation / (threshold as u64)
                let threshold_abs = threshold.unsigned_abs().max(1);
                let ratio = deviation.min(threshold_abs) * 10_000 / threshold_abs;
                coverage_amount * ratio / 10_000
            }

            PayoutMethod::Indexed => {
                // payout = base * |oracle_value| / 1_000_000
                let index = oracle_value.unsigned_abs();
                base_payout.saturating_mul(index) / 1_000_000
            }
        };

        raw.min(max_payout).min(coverage_amount)
    }
}
