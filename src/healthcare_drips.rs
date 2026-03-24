use soroban_sdk::{Address, Env, Symbol, Vec, String, Map, contracttype, contractimpl, symbol_short, Error};

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum HealthcareDripsError {
    Unauthorized = 1,
    InvalidInput = 2,
    NotFound = 3,
    InsufficientBalance = 4,
    AlreadyExists = 5,
    InvalidStatus = 6,
    FraudDetected = 7,
    ConversionFailed = 8,
    SlippageExceeded = 9,
}

impl From<HealthcareDripsError> for Error {
    fn from(val: HealthcareDripsError) -> Self {
        Error::from_contract_error(val as u32)
    }
}

impl<'a> From<&'a HealthcareDripsError> for Error {
    fn from(val: &'a HealthcareDripsError) -> Self {
        Error::from_contract_error(*val as u32)
    }
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum KycStatus {
    NotSubmitted,
    Pending,
    Approved,
    Rejected,
    Expired,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ContributorLevel {
    Basic,
    Verified,
    Professional,
    Expert,
    Elite,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LicenseType {
    Medical,
    Insurance,
    Legal,
    Financial,
    Technical,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LicenseStatus {
    NotSubmitted,
    Pending,
    Verified,
    Expired,
    Revoked,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum IssueStatus {
    Submitted,
    UnderReview,
    Approved,
    Rejected,
    Paid,
    Closed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum IssueType {
    MedicalClaim,
    InsuranceDispute,
    BillingIssue,
    CoverageQuestion,
    FraudReport,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum FraudRiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct KycVerification {
    pub id: u64,
    pub contributor: Address,
    pub full_name: String,
    pub date_of_birth: u64,
    pub nationality: String,
    pub document_type: String,
    pub document_number: String,
    pub ipfs_hash: String,
    pub status: KycStatus,
    pub submitted_at: u64,
    pub reviewed_at: Option<u64>,
    pub reviewer: Option<Address>,
    pub rejection_reason: Option<String>,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ProfessionalLicense {
    pub id: u64,
    pub contributor: Address,
    pub license_type: LicenseType,
    pub license_number: String,
    pub issuing_authority: String,
    pub issue_date: u64,
    pub expiry_date: u64,
    pub verification_code: String,
    pub ipfs_hash: String,
    pub status: LicenseStatus,
    pub submitted_at: u64,
    pub verified_at: Option<u64>,
    pub verifier: Option<Address>,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ContributorStats {
    pub contributor: Address,
    pub kyc_status: KycStatus,
    pub contributor_level: ContributorLevel,
    pub reputation_score: u64,
    pub total_contributions: u64,
    pub successful_contributions: u64,
    pub last_activity: u64,
    pub monthly_decay_applied: bool,
    pub licenses: Vec<ProfessionalLicense>,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct FraudPattern {
    pub pattern_id: u64,
    pub pattern_type: String,
    pub description: String,
    pub weight: u64,
    pub threshold: u64,
    pub active: bool,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct FraudFlag {
    pub claim_id: u64,
    pub risk_level: FraudRiskLevel,
    pub risk_score: u64,
    pub flags: Vec<String>,
    pub detected_at: u64,
    pub reviewer: Option<Address>,
    pub reviewed: bool,
    pub action_taken: Option<String>,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct FraudThresholds {
    pub low_risk_threshold: u64,
    pub medium_risk_threshold: u64,
    pub high_risk_threshold: u64,
    pub critical_risk_threshold: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct TokenAllocation {
    pub token_address: Address,
    pub percentage: u64,
    pub min_balance: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PremiumDrip {
    pub id: u64,
    pub policy_holder: Address,
    pub insurer: Address,
    pub total_premium: u64,
    pub payment_interval: u64,
    pub next_payment_date: u64,
    pub calendar_based: bool,
    pub day_of_month: Option<u64>,
    pub skip_weekends: bool,
    pub skip_holidays: bool,
    pub auto_advance: bool,
    pub token_allocations: Vec<TokenAllocation>,
    pub active: bool,
    pub created_at: u64,
    pub last_payment_at: Option<u64>,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct InsuranceClaim {
    pub id: u64,
    pub claimant: Address,
    pub insurer: Address,
    pub issue_type: IssueType,
    pub amount: u64,
    pub description: String,
    pub evidence_ipfs: Vec<String>,
    pub status: IssueStatus,
    pub submitted_at: u64,
    pub reviewed_at: Option<u64>,
    pub reviewer: Option<Address>,
    pub fraud_flag: Option<FraudFlag>,
    pub payout_amount: Option<u64>,
    pub payout_at: Option<u64>,
}

pub struct HealthcareDrips;

pub struct HealthcareDripsClient<'a> {
    env: &'a Env,
    address: Address,
}

impl<'a> HealthcareDripsClient<'a> {
    pub fn new(env: &'a Env, address: Address) -> Self {
        Self { env, address }
    }
}

#[contractimpl]
impl HealthcareDrips {
    pub fn initialize(env: &Env, admin: Address) {
        if env.storage().instance().has(&symbol_short!("INIT")) {
            panic!("Contract already initialized");
        }

        env.storage().instance().set(&symbol_short!("INIT"), &true);
        env.storage().instance().set(&symbol_short!("IC"), &admin.clone()); // Insurance Coordinator
        env.storage().instance().set(&symbol_short!("RV"), &admin.clone()); // Reviewer
        env.storage().instance().set(&symbol_short!("AP"), &admin); // Approver

        // Initialize fraud detection thresholds
        let thresholds = FraudThresholds {
            low_risk_threshold: 30,
            medium_risk_threshold: 50,
            high_risk_threshold: 70,
            critical_risk_threshold: 90,
        };
        env.storage().instance().set(&symbol_short!("FT"), &thresholds);

        // Initialize KYC counter
        env.storage().instance().set(&symbol_short!("KYC_C"), &0u64);
        
        // Initialize license counter
        env.storage().instance().set(&symbol_short!("LIC_C"), &0u64);
        
        // Initialize claim counter
        env.storage().instance().set(&symbol_short!("CLAIM_C"), &0u64);
        
        // Initialize drip counter
        env.storage().instance().set(&symbol_short!("DRIP_C"), &0u64);

        // Initialize fraud patterns
        Self::initialize_fraud_patterns(env);
    }

    // Enhanced Contributor Verification Functions
    pub fn submit_kyc_verification(
        env: &Env,
        full_name: String,
        date_of_birth: u64,
        nationality: String,
        document_type: String,
        document_number: String,
        ipfs_hash: String,
        contributor: Address,
    ) -> Result<u64, HealthcareDripsError> {
        let kyc_id = env.storage().instance().get(&symbol_short!("KYC_C")).unwrap_or(0u64) + 1;
        env.storage().instance().set(&symbol_short!("KYC_C"), &kyc_id);

        let kyc = KycVerification {
            id: kyc_id,
            contributor: contributor.clone(),
            full_name,
            date_of_birth,
            nationality,
            document_type,
            document_number,
            ipfs_hash,
            status: KycStatus::Pending,
            submitted_at: env.ledger().timestamp(),
            reviewed_at: None,
            reviewer: None,
            rejection_reason: None,
        };

        let kyc_key = symbol_short!("KYC");
        let kyc_map: Map<Address, KycVerification> = env.storage().instance().get(&kyc_key).unwrap_or(Map::new(env));
        let mut new_kyc_map = kyc_map;
        new_kyc_map.set(contributor.clone(), kyc);
        env.storage().instance().set(&kyc_key, &new_kyc_map);

        // Update contributor stats
        Self::update_contributor_kyc_status(env, contributor.clone(), KycStatus::Pending);

        Ok(kyc_id)
    }

    pub fn approve_kyc_verification(
        env: &Env,
        contributor: Address,
        reviewer: Address,
    ) -> Result<(), HealthcareDripsError> {
        Self::require_role(env, reviewer.clone(), symbol_short!("RV"))?;

        let kyc_key = symbol_short!("KYC");
        let kyc_map: Map<Address, KycVerification> = env.storage().instance().get(&kyc_key)
            .ok_or(HealthcareDripsError::NotFound)?;

        let mut kyc = kyc_map.get(contributor.clone())
            .ok_or(HealthcareDripsError::NotFound)?;

        if kyc.status != KycStatus::Pending {
            return Err(HealthcareDripsError::InvalidStatus);
        }

        kyc.status = KycStatus::Approved;
        kyc.reviewed_at = Some(env.ledger().timestamp());
        kyc.reviewer = Some(reviewer);

        let mut new_kyc_map = kyc_map;
        new_kyc_map.set(contributor.clone(), kyc);
        env.storage().instance().set(&kyc_key, &new_kyc_map);

        // Update contributor stats and level
        Self::update_contributor_kyc_status(env, contributor, KycStatus::Approved);

        Ok(())
    }

    pub fn submit_professional_license(
        env: &Env,
        contributor: Address,
        license_type: LicenseType,
        license_number: String,
        issuing_authority: String,
        issue_date: u64,
        expiry_date: u64,
        verification_code: String,
        ipfs_hash: String,
    ) -> Result<u64, HealthcareDripsError> {
        let license_id = env.storage().instance().get(&symbol_short!("LIC_C")).unwrap_or(0u64) + 1;
        env.storage().instance().set(&symbol_short!("LIC_C"), &license_id);

        let license = ProfessionalLicense {
            id: license_id,
            contributor: contributor.clone(),
            license_type,
            license_number,
            issuing_authority,
            issue_date,
            expiry_date,
            verification_code,
            ipfs_hash,
            status: LicenseStatus::Pending,
            submitted_at: env.ledger().timestamp(),
            verified_at: None,
            verifier: None,
        };

        let lic_key = symbol_short!("LICENSE");
        let lic_map: Map<Address, Vec<ProfessionalLicense>> = env.storage().instance().get(&lic_key).unwrap_or(Map::new(env));
        let mut new_lic_map = lic_map.clone();
        
        let mut licenses = lic_map.get(contributor.clone()).unwrap_or(Vec::new(env));
        licenses.push_back(license);
        new_lic_map.set(contributor.clone(), licenses);
        env.storage().instance().set(&lic_key, &new_lic_map);

        Ok(license_id)
    }

    pub fn verify_professional_license(
        env: &Env,
        contributor: Address,
        license_id: u64,
        verifier: Address,
    ) -> Result<(), HealthcareDripsError> {
        Self::require_role(env, verifier.clone(), symbol_short!("RV"))?;

        let lic_key = symbol_short!("LICENSE");
        let lic_map: Map<Address, Vec<ProfessionalLicense>> = env.storage().instance().get(&lic_key)
            .ok_or(HealthcareDripsError::NotFound)?;

        let mut licenses = lic_map.get(contributor.clone())
            .ok_or(HealthcareDripsError::NotFound)?;

        let license_index = licenses.iter().position(|l| l.id == license_id)
            .ok_or(HealthcareDripsError::NotFound)?;

        let mut license = licenses.get(license_index.try_into().unwrap()).unwrap();
        license.status = LicenseStatus::Verified;
        license.verified_at = Some(env.ledger().timestamp());
        license.verifier = Some(verifier);

        licenses.set(license_index.try_into().unwrap(), license);

        let mut new_lic_map = lic_map.clone();
        new_lic_map.set(contributor.clone(), licenses);
        env.storage().instance().set(&lic_key, &new_lic_map);

        // Update contributor level
        Self::update_contributor_level(env, contributor.clone());

        Ok(())
    }

    pub fn apply_reputation_decay(env: &Env, contributor: Address) -> Result<(), HealthcareDripsError> {
        let stats_key = symbol_short!("STATS");
        let stats_map: Map<Address, ContributorStats> = env.storage().instance().get(&stats_key)
            .ok_or(HealthcareDripsError::NotFound)?;

        let mut stats = stats_map.get(contributor.clone())
            .ok_or(HealthcareDripsError::NotFound)?;

        if stats.monthly_decay_applied {
            return Err(HealthcareDripsError::AlreadyExists);
        }

        // Apply 5% monthly decay
        let decay_amount = stats.reputation_score * 5 / 100;
        stats.reputation_score = stats.reputation_score.saturating_sub(decay_amount);
        stats.monthly_decay_applied = true;

        let mut new_stats_map = stats_map;
        new_stats_map.set(contributor, stats);
        env.storage().instance().set(&stats_key, &new_stats_map);

        Ok(())
    }

    // Claim Fraud Detection Functions
    pub fn submit_insurance_claim(
        env: &Env,
        claimant: Address,
        insurer: Address,
        issue_type: IssueType,
        amount: u64,
        description: String,
        evidence_ipfs: Vec<String>,
    ) -> Result<u64, HealthcareDripsError> {
        let claim_id = env.storage().instance().get(&symbol_short!("CLAIM_C")).unwrap_or(0u64) + 1;
        env.storage().instance().set(&symbol_short!("CLAIM_C"), &claim_id);

        let claim = InsuranceClaim {
            id: claim_id,
            claimant: claimant.clone(),
            insurer,
            issue_type,
            amount,
            description,
            evidence_ipfs: evidence_ipfs.clone(),
            status: IssueStatus::Submitted,
            submitted_at: env.ledger().timestamp(),
            reviewed_at: None,
            reviewer: None,
            fraud_flag: None,
            payout_amount: None,
            payout_at: None,
        };

        // Perform fraud detection
        let fraud_flag = Self::analyze_claim_for_fraud(env, claim.clone(), claimant);
        
        let mut final_claim = claim;
        if let Some(flag) = fraud_flag {
            final_claim.status = IssueStatus::UnderReview;
            final_claim.fraud_flag = Some(flag.clone());
        }

        let claim_key = symbol_short!("CLAIM");
        let claim_map: Map<u64, InsuranceClaim> = env.storage().instance().get(&claim_key).unwrap_or(Map::new(env));
        let mut new_claim_map = claim_map;
        new_claim_map.set(claim_id, final_claim);
        env.storage().instance().set(&claim_key, &new_claim_map);

        Ok(claim_id)
    }

    pub fn analyze_claim_for_fraud(env: &Env, claim: InsuranceClaim, claimant: Address) -> Option<FraudFlag> {
        let patterns_key = Symbol::new(env, "FRAUD_PAT");
        let patterns: Map<u64, FraudPattern> = env.storage().instance().get(&patterns_key).unwrap_or(Map::new(env));

        let mut total_score = 0u64;
        let mut detected_flags = Vec::new(env);

        // Analyze various fraud patterns
        for (_, pattern) in patterns {
            if !pattern.active {
                continue;
            }

            let pattern_score = Self::evaluate_pattern(env, &claim, claimant.clone(), &pattern);
            if pattern_score > 0 {
                total_score += pattern_score * pattern.weight / 100;
                detected_flags.push_back(pattern.description.clone());
            }
        }

        if total_score > 0 {
            let thresholds: FraudThresholds = env.storage().instance().get(&symbol_short!("FT")).unwrap();
            
            let risk_level = if total_score >= thresholds.critical_risk_threshold {
                FraudRiskLevel::Critical
            } else if total_score >= thresholds.high_risk_threshold {
                FraudRiskLevel::High
            } else if total_score >= thresholds.medium_risk_threshold {
                FraudRiskLevel::Medium
            } else {
                FraudRiskLevel::Low
            };

            Some(FraudFlag {
                claim_id: claim.id,
                risk_level,
                risk_score: total_score,
                flags: detected_flags,
                detected_at: env.ledger().timestamp(),
                reviewer: None,
                reviewed: false,
                action_taken: None,
            })
        } else {
            None
        }
    }

    fn evaluate_pattern(env: &Env, claim: &InsuranceClaim, claimant: Address, pattern: &FraudPattern) -> u64 {
        match pattern.pattern_type.to_string().as_str() {
            "HIGH_FREQUENCY" => Self::check_high_frequency_claims(env, claimant),
            "UNUSUAL_AMOUNT" => Self::check_unusual_amount(env, claim),
            "SIMILAR_DESCRIPTIONS" => Self::check_similar_descriptions(env, claim),
            "SUSPICIOUS_TIMING" => Self::check_suspicious_timing(env, claim),
            "EVIDENCE_MANIPULATION" => Self::check_evidence_manipulation(env, claim),
            _ => 0,
        }
    }

    fn check_high_frequency_claims(env: &Env, claimant: Address) -> u64 {
        let claim_key = symbol_short!("CLAIM");
        let claim_map: Map<u64, InsuranceClaim> = env.storage().instance().get(&claim_key).unwrap_or(Map::new(env));

        let recent_claims = claim_map.iter()
            .filter(|(_, claim)| claim.claimant == claimant)
            .filter(|(_, claim)| env.ledger().timestamp() - claim.submitted_at < 30 * 24 * 60 * 60) // 30 days
            .count();

        if recent_claims > 5 { 50 } else if recent_claims > 3 { 25 } else { 0 }
    }

    fn check_unusual_amount(env: &Env, claim: &InsuranceClaim) -> u64 {
        let claim_key = symbol_short!("CLAIM");
        let claim_map: Map<u64, InsuranceClaim> = env.storage().instance().get(&claim_key).unwrap_or(Map::new(env));

        let mut amounts: Vec<u64> = Vec::new(env);
        for (_, c) in claim_map.iter() {
            if c.issue_type == claim.issue_type {
                amounts.push_back(c.amount);
            }
        }

        if amounts.is_empty() {
            return 0;
        }

        let avg_amount = amounts.iter().sum::<u64>() / amounts.len() as u64;
        
        if claim.amount > avg_amount * 3 { 60 } else if claim.amount > avg_amount * 2 { 30 } else { 0 }
    }

    fn check_similar_descriptions(env: &Env, claim: &InsuranceClaim) -> u64 {
        // Simplified similarity check - in production, use more sophisticated NLP
        let claim_key = symbol_short!("CLAIM");
        let claim_map: Map<u64, InsuranceClaim> = env.storage().instance().get(&claim_key).unwrap_or(Map::new(env));

        let similar_count = claim_map.iter()
            .filter(|(_, c)| c.description == claim.description && c.id != claim.id)
            .count();

        if similar_count > 2 { 40 } else if similar_count > 0 { 20 } else { 0 }
    }

    fn check_suspicious_timing(env: &Env, claim: &InsuranceClaim) -> u64 {
        let claim_key = symbol_short!("CLAIM");
        let claim_map: Map<u64, InsuranceClaim> = env.storage().instance().get(&claim_key).unwrap_or(Map::new(env));

        let same_day_claims = claim_map.iter()
            .filter(|(_, c)| c.claimant == claim.claimant)
            .filter(|(_, c)| {
                let claim_date = c.submitted_at / (24 * 60 * 60);
                let current_date = claim.submitted_at / (24 * 60 * 60);
                claim_date == current_date && c.id != claim.id
            })
            .count();

        if same_day_claims > 2 { 35 } else { 0 }
    }

    fn check_evidence_manipulation(env: &Env, claim: &InsuranceClaim) -> u64 {
        // Simplified check - in production, use image forensics
        if claim.evidence_ipfs.is_empty() {
            return 25;
        }
        
        // Check for duplicate evidence across different claims
        let claim_key = symbol_short!("CLAIM");
        let claim_map: Map<u64, InsuranceClaim> = env.storage().instance().get(&claim_key).unwrap_or(Map::new(env));

        let duplicate_evidence = claim.evidence_ipfs.iter()
            .any(|evidence| {
                claim_map.iter().any(|(_, c)| {
                    c.id != claim.id && c.evidence_ipfs.contains(evidence.clone())
                })
            });

        if duplicate_evidence { 45 } else { 0 }
    }

    // Multi-Token Premium Support Functions
    pub fn create_premium_drip(
        env: &Env,
        policy_holder: Address,
        insurer: Address,
        total_premium: u64,
        payment_interval: u64,
        calendar_based: bool,
        day_of_month: Option<u64>,
        skip_weekends: bool,
        skip_holidays: bool,
        auto_advance: bool,
        token_allocations: Vec<TokenAllocation>,
    ) -> Result<u64, HealthcareDripsError> {
        let drip_id = env.storage().instance().get(&symbol_short!("DRIP_C")).unwrap_or(0u64) + 1;
        env.storage().instance().set(&symbol_short!("DRIP_C"), &drip_id);

        // Validate token allocations sum to 100%
        let total_percentage: u64 = token_allocations.iter().map(|ta| ta.percentage).sum();
        if total_percentage != 100 {
            return Err(HealthcareDripsError::InvalidInput);
        }

        let next_payment_date = if calendar_based {
            Self::calculate_next_calendar_payment(env, day_of_month.unwrap_or(1), skip_weekends, skip_holidays)
        } else {
            env.ledger().timestamp() + payment_interval
        };

        let drip = PremiumDrip {
            id: drip_id,
            policy_holder: policy_holder.clone(),
            insurer,
            total_premium,
            payment_interval,
            next_payment_date,
            calendar_based,
            day_of_month,
            skip_weekends,
            skip_holidays,
            auto_advance,
            token_allocations: token_allocations.clone(),
            active: true,
            created_at: env.ledger().timestamp(),
            last_payment_at: None,
        };

        let drip_key = symbol_short!("DRIP");
        let drip_map: Map<u64, PremiumDrip> = env.storage().instance().get(&drip_key).unwrap_or(Map::new(env));
        let mut new_drip_map = drip_map;
        new_drip_map.set(drip_id, drip);
        env.storage().instance().set(&drip_key, &new_drip_map);

        // Initialize token balance monitoring
        Self::initialize_token_monitoring(env, policy_holder, &token_allocations);

        Ok(drip_id)
    }

    pub fn process_premium_payment(env: &Env, drip_id: u64, payer: Address) -> Result<(), HealthcareDripsError> {
        let drip_key = symbol_short!("DRIP");
        let drip_map: Map<u64, PremiumDrip> = env.storage().instance().get(&drip_key)
            .ok_or(HealthcareDripsError::NotFound)?;

        let mut drip = drip_map.get(drip_id)
            .ok_or(HealthcareDripsError::NotFound)?;

        if drip.policy_holder != payer {
            return Err(HealthcareDripsError::Unauthorized);
        }

        if !drip.active {
            return Err(HealthcareDripsError::InvalidStatus);
        }

        if env.ledger().timestamp() < drip.next_payment_date {
            return Err(HealthcareDripsError::InvalidInput);
        }

        // Process multi-token payment
        for allocation in drip.token_allocations.iter() {
            let amount = drip.total_premium * allocation.percentage / 100;
            
            // Check token balance
            if !Self::check_token_balance(env, payer.clone(), &allocation.token_address, amount) {
                return Err(HealthcareDripsError::InsufficientBalance);
            }

            // Convert through Stellar DEX if needed
            let _converted_amount = Self::convert_through_dex(env, &allocation.token_address, amount, 5)?; // 5% slippage tolerance
            
            // Transfer to insurer
            // In production, implement actual token transfer logic
        }

        // Update drip
        drip.last_payment_at = Some(env.ledger().timestamp());
        
        if drip.calendar_based {
            drip.next_payment_date = Self::calculate_next_calendar_payment(
                env, 
                drip.day_of_month.unwrap_or(1), 
                drip.skip_weekends, 
                drip.skip_holidays
            );
        } else {
            drip.next_payment_date = env.ledger().timestamp() + drip.payment_interval;
        }

        let mut new_drip_map = drip_map;
        new_drip_map.set(drip_id, drip);
        env.storage().instance().set(&drip_key, &new_drip_map);

        Ok(())
    }

    pub fn skip_payment(env: &Env, drip_id: u64, policy_holder: Address) -> Result<(), HealthcareDripsError> {
        let drip_key = symbol_short!("DRIP");
        let drip_map: Map<u64, PremiumDrip> = env.storage().instance().get(&drip_key)
            .ok_or(HealthcareDripsError::NotFound)?;

        let mut drip = drip_map.get(drip_id)
            .ok_or(HealthcareDripsError::NotFound)?;

        if drip.policy_holder != policy_holder {
            return Err(HealthcareDripsError::Unauthorized);
        }

        if !drip.auto_advance {
            return Err(HealthcareDripsError::InvalidInput);
        }

        // Calculate next payment date
        if drip.calendar_based {
            drip.next_payment_date = Self::calculate_next_calendar_payment(
                env, 
                drip.day_of_month.unwrap_or(1), 
                drip.skip_weekends, 
                drip.skip_holidays
            );
        } else {
            drip.next_payment_date = env.ledger().timestamp() + drip.payment_interval;
        }

        let mut new_drip_map = drip_map;
        new_drip_map.set(drip_id, drip);
        env.storage().instance().set(&drip_key, &new_drip_map);

        Ok(())
    }

    pub fn advance_payment(env: &Env, drip_id: u64, policy_holder: Address) -> Result<(), HealthcareDripsError> {
        let drip_key = symbol_short!("DRIP");
        let drip_map: Map<u64, PremiumDrip> = env.storage().instance().get(&drip_key)
            .ok_or(HealthcareDripsError::NotFound)?;

        let drip = drip_map.get(drip_id)
            .ok_or(HealthcareDripsError::NotFound)?;

        if drip.policy_holder != policy_holder {
            return Err(HealthcareDripsError::Unauthorized);
        }

        // Process payment immediately
        Self::process_premium_payment(env, drip_id, policy_holder)?;

        Ok(())
    }

    // Helper Functions
    fn require_role(env: &Env, user: Address, role: Symbol) -> Result<(), HealthcareDripsError> {
        let role_user: Option<Address> = env.storage().instance().get(&role);
        if role_user != Some(user) {
            return Err(HealthcareDripsError::Unauthorized);
        }
        Ok(())
    }

    fn update_contributor_kyc_status(env: &Env, contributor: Address, status: KycStatus) {
        let stats_key = symbol_short!("STATS");
        let stats_map: Map<Address, ContributorStats> = env.storage().instance().get(&stats_key).unwrap_or(Map::new(env));
        
        let mut stats = stats_map.get(contributor.clone()).unwrap_or(ContributorStats {
            contributor: contributor.clone(),
            kyc_status: KycStatus::NotSubmitted,
            contributor_level: ContributorLevel::Basic,
            reputation_score: 50, // Starting reputation
            total_contributions: 0,
            successful_contributions: 0,
            last_activity: env.ledger().timestamp(),
            monthly_decay_applied: false,
            licenses: Vec::new(env),
        });

        stats.kyc_status = status.clone();
        stats.last_activity = env.ledger().timestamp();

        // Update level based on KYC status
        stats.contributor_level = match status.clone() {
            KycStatus::Approved => ContributorLevel::Verified,
            _ => ContributorLevel::Basic,
        };

        let mut new_stats_map = stats_map;
        new_stats_map.set(contributor, stats);
        env.storage().instance().set(&stats_key, &new_stats_map);
    }

    fn update_contributor_level(env: &Env, contributor: Address) {
        let stats_key = symbol_short!("STATS");
        let stats_map: Map<Address, ContributorStats> = env.storage().instance().get(&stats_key).unwrap_or(Map::new(env));
        
        let mut stats = stats_map.get(contributor.clone()).unwrap_or(ContributorStats {
            contributor: contributor.clone(),
            kyc_status: KycStatus::NotSubmitted,
            contributor_level: ContributorLevel::Basic,
            reputation_score: 50,
            total_contributions: 0,
            successful_contributions: 0,
            last_activity: env.ledger().timestamp(),
            monthly_decay_applied: false,
            licenses: Vec::new(env),
        });

        // Get licenses
        let lic_key = symbol_short!("LICENSE");
        let lic_map: Map<Address, Vec<ProfessionalLicense>> = env.storage().instance().get(&lic_key).unwrap_or(Map::new(env));
        let licenses = lic_map.get(contributor.clone()).unwrap_or(Vec::new(env));

        let verified_licenses = licenses.iter().filter(|l| l.status == LicenseStatus::Verified).count();

        // Update level based on KYC and licenses
        stats.contributor_level = if stats.kyc_status == KycStatus::Approved {
            match verified_licenses {
                0 => ContributorLevel::Verified,
                1 => ContributorLevel::Professional,
                2 => ContributorLevel::Expert,
                _ => ContributorLevel::Elite,
            }
        } else {
            ContributorLevel::Basic
        };

        stats.licenses = licenses;
        stats.last_activity = env.ledger().timestamp();

        let mut new_stats_map = stats_map;
        new_stats_map.set(contributor, stats);
        env.storage().instance().set(&stats_key, &new_stats_map);
    }

    fn initialize_fraud_patterns(env: &Env) {
        let patterns_key = Symbol::new(env, "FRAUD_PAT");
        let mut patterns = Map::new(env);

        // High frequency claims pattern
        patterns.set(1u64, FraudPattern {
            pattern_id: 1,
            pattern_type: String::from_str(env, "HIGH_FREQUENCY"),
            description: String::from_str(env, "Multiple claims submitted in short time period"),
            weight: 80,
            threshold: 3,
            active: true,
        });

        // Unusual amount pattern
        patterns.set(2u64, FraudPattern {
            pattern_id: 2,
            pattern_type: String::from_str(env, "UNUSUAL_AMOUNT"),
            description: String::from_str(env, "Claim amount significantly higher than average"),
            weight: 90,
            threshold: 2,
            active: true,
        });

        // Similar descriptions pattern
        patterns.set(3u64, FraudPattern {
            pattern_id: 3,
            pattern_type: String::from_str(env, "SIMILAR_DESCRIPTIONS"),
            description: String::from_str(env, "Identical or very similar claim descriptions"),
            weight: 70,
            threshold: 2,
            active: true,
        });

        // Suspicious timing pattern
        patterns.set(4u64, FraudPattern {
            pattern_id: 4,
            pattern_type: String::from_str(env, "SUSPICIOUS_TIMING"),
            description: String::from_str(env, "Multiple claims submitted on same day"),
            weight: 60,
            threshold: 3,
            active: true,
        });

        // Evidence manipulation pattern
        patterns.set(5u64, FraudPattern {
            pattern_id: 5,
            pattern_type: String::from_str(env, "EVIDENCE_MANIPULATION"),
            description: String::from_str(env, "Duplicate or missing evidence"),
            weight: 85,
            threshold: 1,
            active: true,
        });

        env.storage().instance().set(&patterns_key, &patterns);
    }

    fn calculate_next_calendar_payment(
        env: &Env,
        day_of_month: u64,
        skip_weekends: bool,
        skip_holidays: bool,
    ) -> u64 {
        let current_time = env.ledger().timestamp();
        let current_day = (current_time / (24 * 60 * 60)) as u64;
        
        // Calculate days in current month (simplified)
        let days_in_month = 30; // Simplified, use actual calendar in production
        
        let mut next_day = current_day + 1;
        if next_day > days_in_month {
            next_day = day_of_month;
        } else {
            next_day = day_of_month;
        }

        let mut next_timestamp = (next_day as u64) * 24 * 60 * 60;

        // Skip weekends if enabled
        if skip_weekends {
            let day_of_week = (next_day % 7) + 1; // Simplified
            if day_of_week == 6 { // Saturday
                next_timestamp += 2 * 24 * 60 * 60;
            } else if day_of_week == 7 { // Sunday
                next_timestamp += 1 * 24 * 60 * 60;
            }
        }

        // Skip holidays if enabled (simplified)
        if skip_holidays {
            // Add holiday checking logic in production
        }

        next_timestamp
    }

    fn initialize_token_monitoring(env: &Env, policy_holder: Address, allocations: &Vec<TokenAllocation>) {
        let monitor_key = Symbol::new(env, "TOKEN_MON");
        let monitor_map: Map<Address, Vec<TokenAllocation>> = env.storage().instance().get(&monitor_key).unwrap_or(Map::new(env));
        let mut new_monitor_map = monitor_map;
        new_monitor_map.set(policy_holder, allocations.clone());
        env.storage().instance().set(&monitor_key, &new_monitor_map);
    }

    fn check_token_balance(env: &Env, address: Address, token: &Address, required_amount: u64) -> bool {
        // Simplified balance check - implement actual token balance query in production
        true
    }

    fn convert_through_dex(env: &Env, token: &Address, amount: u64, slippage_tolerance: u64) -> Result<u64, HealthcareDripsError> {
        // Simplified DEX conversion - implement actual Stellar DEX integration in production
        // Apply slippage protection
        let min_output = amount * (100 - slippage_tolerance) / 100;
        Ok(min_output)
    }

    // Getter Functions
    pub fn get_kyc_verification(env: &Env, contributor: Address) -> Result<KycVerification, HealthcareDripsError> {
        let kyc_key = symbol_short!("KYC");
        let kyc_map: Map<Address, KycVerification> = env.storage().instance().get(&kyc_key)
            .ok_or(HealthcareDripsError::NotFound)?;

        kyc_map.get(contributor).ok_or(HealthcareDripsError::NotFound)
    }

    pub fn get_contributor_stats(env: &Env, contributor: Address) -> Result<ContributorStats, HealthcareDripsError> {
        let stats_key = symbol_short!("STATS");
        let stats_map: Map<Address, ContributorStats> = env.storage().instance().get(&stats_key)
            .ok_or(HealthcareDripsError::NotFound)?;

        stats_map.get(contributor).ok_or(HealthcareDripsError::NotFound)
    }

    pub fn get_insurance_claim(env: &Env, claim_id: u64) -> Result<InsuranceClaim, HealthcareDripsError> {
        let claim_key = symbol_short!("CLAIM");
        let claim_map: Map<u64, InsuranceClaim> = env.storage().instance().get(&claim_key)
            .ok_or(HealthcareDripsError::NotFound)?;

        claim_map.get(claim_id).ok_or(HealthcareDripsError::NotFound)
    }

    pub fn get_premium_drip(env: &Env, drip_id: u64) -> Result<PremiumDrip, HealthcareDripsError> {
        let drip_key = symbol_short!("DRIP");
        let drip_map: Map<u64, PremiumDrip> = env.storage().instance().get(&drip_key)
            .ok_or(HealthcareDripsError::NotFound)?;

        drip_map.get(drip_id).ok_or(HealthcareDripsError::NotFound)
    }
}
