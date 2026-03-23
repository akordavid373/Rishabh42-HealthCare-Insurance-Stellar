#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, Env, Symbol, Vec, Map,
    token, BytesN, String
};

use soroban_sdk::auth::ContractAuth;
use soroban_sdk::crypto::sha256;
use soroban_sdk::xdr::ScVal;

// ========== CONSTANTS ==========
const HEALTHCARE_DRIPS: Symbol = Symbol::short("HD");
const ISSUE_CREATOR: Symbol = Symbol::short("IC");
const CONTRIBUTOR: Symbol = Symbol::short("CT");
const REVIEWER: Symbol = Symbol::short("RV");
const APPROVER: Symbol = Symbol::short("AP");

// ========== TYPES ==========
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum IssueType {
    EmergencyTreatment = 0,
    Surgery = 1,
    PreventiveCare = 2,
    ChronicCondition = 3,
    MentalHealth = 4,
    Rehabilitation = 5,
    MedicalEquipment = 6,
    ResearchFunding = 7,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum IssueStatus {
    Draft = 0,
    Submitted = 1,
    UnderReview = 2,
    PendingApproval = 3,
    Approved = 4,
    Rejected = 5,
    Completed = 6,
    Cancelled = 7,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum ContributorLevel {
    Junior = 0,
    Intermediate = 1,
    Senior = 2,
    Expert = 3,
    Master = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PremiumDrip {
    pub id: u64,
    pub patient: Address,
    pub insurer: Address,
    pub token: Address,
    pub premium_amount: i128,
    pub interval: u64,
    pub last_payment: u64,
    pub next_payment: u64,
    pub active: bool,
    pub total_paid: i128,
    pub created: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Issue {
    pub id: u64,
    pub creator: Address,
    pub patient: Address,
    pub issue_type: IssueType,
    pub title: String,
    pub description: String,
    pub funding_amount: i128,
    pub medical_record: String, // IPFS hash
    pub deadline: u64,
    pub status: IssueStatus,
    pub required_approvals: u32,
    pub current_approvals: u32,
    pub created: u64,
    pub last_updated: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Application {
    pub contributor: Address,
    pub statement: String,
    pub reputation: u32,
    pub contribution_amount: i128,
    pub applied: u64,
    pub approved: bool,
    pub reviewed: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContributorStats {
    pub contributor: Address,
    pub total_issues_reviewed: u32,
    pub total_issues_approved: u32,
    pub total_contributed: i128,
    pub level: ContributorLevel,
    pub reputation: u32,
    pub joined: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserSecurity {
    pub address: Address,
    pub mfa_enabled: bool,
    pub mfa_method: Symbol, // TOTP, SMS, EMAIL
    pub backup_codes_count: u32,
    pub trusted_devices_count: u32,
    pub last_updated: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MedicalRecord {
    pub id: u64,
    pub owner: Address,
    pub cid: String, // Encrypted IPFS Hash
    pub description: String,
    pub created: u64,
    pub version: u32,
    pub authorized_users: Vec<Address>,
}

// ========== ERRORS ==========
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum HealthcareDripsError {
    Unauthorized = 1,
    InvalidAmount = 2,
    InvalidDeadline = 3,
    InvalidIssueId = 4,
    IssueNotDraft = 5,
    IssueNotSubmitted = 6,
    IssueNotActive = 7,
    DeadlineExpired = 8,
    AlreadyApplied = 9,
    NotVerifiedContributor = 10,
    InsufficientApprovals = 11,
    ContributorNotFound = 12,
    InvalidToken = 13,
    InsufficientBalance = 14,
    TransferFailed = 15,
    InvalidRecordId = 16,
    RecordNotOwned = 17,
    MfaAlreadyEnabled = 18,
    MfaNotEnabled = 19,
    InvalidMfaMethod = 20,
}

// ========== CONTRACT ==========
#[contract]
pub struct HealthcareDrips;

#[contractimpl]
impl HealthcareDrips {
    // ========== INITIALIZATION ==========
    
    pub fn initialize(env: &Env, admin: Address) {
        // Set up roles
        env.storage().instance().set(&ISSUE_CREATOR, &admin);
        env.storage().instance().set(&REVIEWER, &admin);
        env.storage().instance().set(&APPROVER, &admin);
        
        // Initialize counters
        env.storage().instance().set(&Symbol::short("next_drip_id"), &1u64);
        env.storage().instance().set(&Symbol::short("next_issue_id"), &1u64);
        env.storage().instance().set(&Symbol::short("next_record_id"), &1u64);
        
        // Initialize verified contributors list
        env.storage().instance().set(&Symbol::short("verified_contributors"), &Vec::new(env));
        
        // Initialize active issues list
        env.storage().instance().set(&Symbol::short("active_issues"), &Vec::new(env));
    }
    
    // ========== PREMIUM DRIPS ==========
    
    pub fn create_premium_drip(
        env: &Env,
        patient: Address,
        insurer: Address,
        token: Address,
        premium_amount: i128,
        interval: u64,
    ) -> Result<u64, HealthcareDripsError> {
        if premium_amount <= 0 {
            return Err(HealthcareDripsError::InvalidAmount);
        }
        
        if interval < 86400 { // Minimum 1 day
            return Err(HealthcareDripsError::InvalidAmount);
        }
        
        let next_id = Self::get_next_drip_id(env);
        
        let current_time = env.ledger().timestamp();
        
        let drip = PremiumDrip {
            id: next_id,
            patient: patient.clone(),
            insurer: insurer.clone(),
            token: token.clone(),
            premium_amount,
            interval,
            last_payment: current_time,
            next_payment: current_time + interval,
            active: true,
            total_paid: 0,
            created: current_time,
        };
        
        // Store drip
        env.storage().instance().set(&Symbol::new(&env, &format!("drip_{}", next_id)), &drip);
        
        // Add to patient's drips
        let mut patient_drips: Vec<u64> = env.storage().instance()
            .get(&Symbol::new(&env, &format!("patient_drips_{}", patient)))
            .unwrap_or(Vec::new(env));
        patient_drips.push_back(next_id);
        env.storage().instance().set(&Symbol::new(&env, &format!("patient_drips_{}", patient)), &patient_drips);
        
        Ok(next_id)
    }
    
    pub fn process_premium_payment(
        env: &Env,
        drip_id: u64,
    ) -> Result<(), HealthcareDripsError> {
        let drip_key = Symbol::new(&env, &format!("drip_{}", drip_id));
        let mut drip: PremiumDrip = env.storage().instance()
            .get(&drip_key)
            .ok_or(HealthcareDripsError::InvalidIssueId)?;
        
        if !drip.active {
            return Err(HealthcareDripsError::IssueNotActive);
        }
        
        let current_time = env.ledger().timestamp();
        if current_time < drip.next_payment {
            return Err(HealthcareDripsError::InvalidAmount); // Payment not due yet
        }
        
        // In a real implementation, this would transfer tokens
        // For now, we'll just update the state
        drip.last_payment = current_time;
        drip.next_payment = current_time + drip.interval;
        drip.total_paid += drip.premium_amount;
        
        env.storage().instance().set(&drip_key, &drip);
        
        Ok(())
    }
    
    pub fn cancel_premium_drip(
        env: &Env,
        drip_id: u64,
        caller: Address,
    ) -> Result<(), HealthcareDripsError> {
        let drip_key = Symbol::new(&env, &format!("drip_{}", drip_id));
        let mut drip: PremiumDrip = env.storage().instance()
            .get(&drip_key)
            .ok_or(HealthcareDripsError::InvalidIssueId)?;
        
        if drip.patient != caller {
            return Err(HealthcareDripsError::Unauthorized);
        }
        
        drip.active = false;
        env.storage().instance().set(&drip_key, &drip);
        
        Ok(())
    }
    
    // ========== ISSUE MANAGEMENT ==========
    
    pub fn create_issue(
        env: &Env,
        patient: Address,
        issue_type: IssueType,
        title: String,
        description: String,
        funding_amount: i128,
        medical_record: String,
        deadline: u64,
        required_approvals: u32,
        caller: Address,
    ) -> Result<u64, HealthcareDripsError> {
        // Check authorization
        if !Self::has_role(env, caller, ISSUE_CREATOR) {
            return Err(HealthcareDripsError::Unauthorized);
        }
        
        if funding_amount <= 0 {
            return Err(HealthcareDripsError::InvalidAmount);
        }
        
        if deadline <= env.ledger().timestamp() {
            return Err(HealthcareDripsError::InvalidDeadline);
        }
        
        if required_approvals < 2 {
            return Err(HealthcareDripsError::InsufficientApprovals);
        }
        
        let next_id = Self::get_next_issue_id(env);
        let current_time = env.ledger().timestamp();
        
        let issue = Issue {
            id: next_id,
            creator: caller.clone(),
            patient: patient.clone(),
            issue_type,
            title: title.clone(),
            description,
            funding_amount,
            medical_record,
            deadline,
            status: IssueStatus::Draft,
            required_approvals,
            current_approvals: 0,
            created: current_time,
            last_updated: current_time,
        };
        
        // Store issue
        env.storage().instance().set(&Symbol::new(&env, &format!("issue_{}", next_id)), &issue);
        
        // Add to patient's issues
        let mut patient_issues: Vec<u64> = env.storage().instance()
            .get(&Symbol::new(&env, &format!("patient_issues_{}", patient)))
            .unwrap_or(Vec::new(env));
        patient_issues.push_back(next_id);
        env.storage().instance().set(&Symbol::new(&env, &format!("patient_issues_{}", patient)), &patient_issues);
        
        Ok(next_id)
    }
    
    pub fn submit_issue(
        env: &Env,
        issue_id: u64,
        caller: Address,
    ) -> Result<(), HealthcareDripsError> {
        let issue_key = Symbol::new(&env, &format!("issue_{}", issue_id));
        let mut issue: Issue = env.storage().instance()
            .get(&issue_key)
            .ok_or(HealthcareDripsError::InvalidIssueId)?;
        
        if issue.status != IssueStatus::Draft {
            return Err(HealthcareDripsError::IssueNotDraft);
        }
        
        if issue.creator != caller && issue.patient != caller {
            return Err(HealthcareDripsError::Unauthorized);
        }
        
        issue.status = IssueStatus::Submitted;
        issue.last_updated = env.ledger().timestamp();
        
        env.storage().instance().set(&issue_key, &issue);
        
        // Add to active issues
        let mut active_issues: Vec<u64> = env.storage().instance()
            .get(&Symbol::short("active_issues"))
            .unwrap_or(Vec::new(env));
        active_issues.push_back(issue_id);
        env.storage().instance().set(&Symbol::short("active_issues"), &active_issues);
        
        Ok(())
    }
    
    pub fn apply_to_issue(
        env: &Env,
        issue_id: u64,
        statement: String,
        caller: Address,
    ) -> Result<(), HealthcareDripsError> {
        let issue_key = Symbol::new(&env, &format!("issue_{}", issue_id));
        let issue: Issue = env.storage().instance()
            .get(&issue_key)
            .ok_or(HealthcareDripsError::InvalidIssueId)?;
        
        if issue.status != IssueStatus::Submitted {
            return Err(HealthcareDripsError::IssueNotSubmitted);
        }
        
        if env.ledger().timestamp() > issue.deadline {
            return Err(HealthcareDripsError::DeadlineExpired);
        }
        
        if !Self::is_verified_contributor(env, caller.clone()) {
            return Err(HealthcareDripsError::NotVerifiedContributor);
        }
        
        let application_key = Symbol::new(&env, &format!("app_{}_{}", issue_id, caller));
        if env.storage().instance().has(&application_key) {
            return Err(HealthcareDripsError::AlreadyApplied);
        }
        
        let application = Application {
            contributor: caller.clone(),
            statement: statement.clone(),
            reputation: Self::get_contributor_reputation(env, caller.clone()),
            contribution_amount: 0,
            applied: env.ledger().timestamp(),
            approved: false,
            reviewed: 0,
        };
        
        env.storage().instance().set(&application_key, &application);
        
        // Add to issue applications
        let mut applications: Vec<Address> = env.storage().instance()
            .get(&Symbol::new(&env, &format!("applications_{}", issue_id)))
            .unwrap_or(Vec::new(env));
        applications.push_back(caller.clone());
        env.storage().instance().set(&Symbol::new(&env, &format!("applications_{}", issue_id)), &applications);
        
        // Update contributor stats
        Self::update_contributor_stats(env, caller.clone());
        
        Ok(())
    }
    
    pub fn review_application(
        env: &Env,
        issue_id: u64,
        contributor: Address,
        approved: bool,
        reason: String,
        caller: Address,
    ) -> Result<(), HealthcareDripsError> {
        if !Self::has_role(env, caller, REVIEWER) {
            return Err(HealthcareDripsError::Unauthorized);
        }
        
        let issue_key = Symbol::new(&env, &format!("issue_{}", issue_id));
        let mut issue: Issue = env.storage().instance()
            .get(&issue_key)
            .ok_or(HealthcareDripsError::InvalidIssueId)?;
        
        if issue.status != IssueStatus::Submitted {
            return Err(HealthcareDripsError::IssueNotSubmitted);
        }
        
        let application_key = Symbol::new(&env, &format!("app_{}_{}", issue_id, contributor));
        let mut application: Application = env.storage().instance()
            .get(&application_key)
            .ok_or(HealthcareDripsError::NotVerifiedContributor)?;
        
        // Update application
        application.approved = approved;
        application.reviewed = env.ledger().timestamp();
        env.storage().instance().set(&application_key, &application);
        
        // Update contributor stats
        let stats_key = Symbol::new(&env, &format!("stats_{}", contributor));
        let mut stats: ContributorStats = env.storage().instance()
            .get(&stats_key)
            .ok_or(HealthcareDripsError::ContributorNotFound)?;
        
        stats.total_issues_reviewed += 1;
        if approved {
            stats.total_issues_approved += 1;
            stats.reputation += 5;
            issue.current_approvals += 1;
        } else {
            stats.reputation += 2;
        }
        
        env.storage().instance().set(&stats_key, &stats);
        
        // Check if issue should be approved
        if issue.current_approvals >= issue.required_approvals {
            issue.status = IssueStatus::Approved;
            issue.last_updated = env.ledger().timestamp();
            env.storage().instance().set(&issue_key, &issue);
        }
        
        Ok(())
    }
    
    pub fn approve_issue(
        env: &Env,
        issue_id: u64,
        caller: Address,
    ) -> Result<(), HealthcareDripsError> {
        if !Self::has_role(env, caller, APPROVER) {
            return Err(HealthcareDripsError::Unauthorized);
        }
        
        let issue_key = Symbol::new(&env, &format!("issue_{}", issue_id));
        let mut issue: Issue = env.storage().instance()
            .get(&issue_key)
            .ok_or(HealthcareDripsError::InvalidIssueId)?;
        
        if issue.status != IssueStatus::Submitted {
            return Err(HealthcareDripsError::IssueNotSubmitted);
        }
        
        issue.status = IssueStatus::Approved;
        issue.last_updated = env.ledger().timestamp();
        
        env.storage().instance().set(&issue_key, &issue);
        
        Ok(())
    }
    
    pub fn verify_contributor(
        env: &Env,
        contributor: Address,
        level: ContributorLevel,
        caller: Address,
    ) -> Result<(), HealthcareDripsError> {
        if !Self::has_role(env, caller, ISSUE_CREATOR) {
            return Err(HealthcareDripsError::Unauthorized);
        }
        
        let stats_key = Symbol::new(&env, &format!("stats_{}", contributor));
        let mut stats: ContributorStats = env.storage().instance()
            .get(&stats_key)
            .ok_or(HealthcareDripsError::ContributorNotFound)?;
        
        stats.level = level;
        stats.reputation += match level {
            ContributorLevel::Expert => 100,
            ContributorLevel::Senior => 50,
            ContributorLevel::Intermediate => 25,
            ContributorLevel::Junior => 10,
            ContributorLevel::Master => 200,
        };
        
        env.storage().instance().set(&stats_key, &stats);
        
        // Add to verified contributors
        let mut verified: Vec<Address> = env.storage().instance()
            .get(&Symbol::short("verified_contributors"))
            .unwrap_or(Vec::new(env));
        verified.push_back(contributor.clone());
        env.storage().instance().set(&Symbol::short("verified_contributors"), &verified);
        
        Ok(())
    }
    
    // ========== MEDICAL RECORDS ==========
    
    pub fn upload_medical_record(
        env: &Env,
        owner: Address,
        cid: String,
        description: String,
    ) -> Result<u64, HealthcareDripsError> {
        owner.require_auth();
        
        let next_id = Self::get_next_record_id(env);
        let current_time = env.ledger().timestamp();
        
        let record = MedicalRecord {
            id: next_id,
            owner: owner.clone(),
            cid,
            description,
            created: current_time,
            version: 1,
            authorized_users: Vec::new(env),
        };
        
        let record_key = Symbol::new(&env, &format!("record_{}", next_id));
        env.storage().instance().set(&record_key, &record);
        
        // Add to owner's records
        let mut owner_records: Vec<u64> = env.storage().instance()
            .get(&Symbol::new(&env, &format!("owner_records_{}", owner)))
            .unwrap_or(Vec::new(env));
        owner_records.push_back(next_id);
        env.storage().instance().set(&Symbol::new(&env, &format!("owner_records_{}", owner)), &owner_records);
        
        Ok(next_id)
    }
    
    pub fn update_medical_record(
        env: &Env,
        record_id: u64,
        cid: String,
        caller: Address,
    ) -> Result<(), HealthcareDripsError> {
        caller.require_auth();
        
        let record_key = Symbol::new(&env, &format!("record_{}", record_id));
        let mut record: MedicalRecord = env.storage().instance()
            .get(&record_key)
            .ok_or(HealthcareDripsError::InvalidRecordId)?;
            
        if record.owner != caller {
            return Err(HealthcareDripsError::RecordNotOwned);
        }
        
        record.cid = cid;
        record.version += 1;
        record.created = env.ledger().timestamp();
        
        env.storage().instance().set(&record_key, &record);
        
        Ok(())
    }
    
    pub fn authorize_user(
        env: &Env,
        record_id: u64,
        user_to_authorize: Address,
        caller: Address,
    ) -> Result<(), HealthcareDripsError> {
        caller.require_auth();
        
        let record_key = Symbol::new(&env, &format!("record_{}", record_id));
        let mut record: MedicalRecord = env.storage().instance()
            .get(&record_key)
            .ok_or(HealthcareDripsError::InvalidRecordId)?;
            
        if record.owner != caller {
            return Err(HealthcareDripsError::RecordNotOwned);
        }
        
        if !record.authorized_users.contains(user_to_authorize.clone()) {
            record.authorized_users.push_back(user_to_authorize);
            env.storage().instance().set(&record_key, &record);
        }
        
        Ok(())
    }
    
    pub fn revoke_user(
        env: &Env,
        record_id: u64,
        user_to_revoke: Address,
        caller: Address,
    ) -> Result<(), HealthcareDripsError> {
        caller.require_auth();
        
        let record_key = Symbol::new(&env, &format!("record_{}", record_id));
        let mut record: MedicalRecord = env.storage().instance()
            .get(&record_key)
            .ok_or(HealthcareDripsError::InvalidRecordId)?;
            
        if record.owner != caller {
            return Err(HealthcareDripsError::RecordNotOwned);
        }
        
        let mut new_authorized = Vec::new(env);
        for user in record.authorized_users.iter() {
            if user != user_to_revoke {
                new_authorized.push_back(user);
            }
        }
        record.authorized_users = new_authorized;
        env.storage().instance().set(&record_key, &record);
        
        Ok(())
    }
    
    pub fn get_medical_record(
        env: &Env,
        record_id: u64,
        caller: Address,
    ) -> Result<MedicalRecord, HealthcareDripsError> {
        let record_key = Symbol::new(&env, &format!("record_{}", record_id));
        let record: MedicalRecord = env.storage().instance()
            .get(&record_key)
            .ok_or(HealthcareDripsError::InvalidRecordId)?;
            
        if record.owner != caller && !record.authorized_users.contains(caller) && !Self::has_role(env, caller, REVIEWER) {
            return Err(HealthcareDripsError::Unauthorized);
        }
        
        Ok(record)
    }
    
    pub fn get_owner_records(env: &Env, owner: Address) -> Vec<u64> {
        env.storage().instance()
            .get(&Symbol::new(&env, &format!("owner_records_{}", owner)))
            .unwrap_or(Vec::new(env))
    }
    
    // ========== MFA SECURITY ==========
    
    pub fn setup_mfa(
        env: &Env,
        user: Address,
        method: Symbol,
        backup_codes: u32,
    ) -> Result<(), HealthcareDripsError> {
        user.require_auth();
        
        let security_key = Symbol::new(&env, &format!("security_{}", user));
        if env.storage().instance().has(&security_key) {
            let mut security: UserSecurity = env.storage().instance().get(&security_key).unwrap();
            if security.mfa_enabled {
                return Err(HealthcareDripsError::MfaAlreadyEnabled);
            }
            security.mfa_enabled = true;
            security.mfa_method = method;
            security.backup_codes_count = backup_codes;
            security.last_updated = env.ledger().timestamp();
            env.storage().instance().set(&security_key, &security);
        } else {
            let security = UserSecurity {
                address: user.clone(),
                mfa_enabled: true,
                mfa_method: method,
                backup_codes_count: backup_codes,
                trusted_devices_count: 1,
                last_updated: env.ledger().timestamp(),
            };
            env.storage().instance().set(&security_key, &security);
        }
        
        Ok(())
    }
    
    pub fn disable_mfa(env: &Env, user: Address) -> Result<(), HealthcareDripsError> {
        user.require_auth();
        
        let security_key = Symbol::new(&env, &format!("security_{}", user));
        let mut security: UserSecurity = env.storage().instance()
            .get(&security_key)
            .ok_or(HealthcareDripsError::MfaNotEnabled)?;
            
        security.mfa_enabled = false;
        security.last_updated = env.ledger().timestamp();
        
        env.storage().instance().set(&security_key, &security);
        
        Ok(())
    }
    
    pub fn get_user_security(env: &Env, user: Address) -> Result<UserSecurity, HealthcareDripsError> {
        let security_key = Symbol::new(&env, &format!("security_{}", user));
        env.storage().instance()
            .get(&security_key)
            .ok_or(HealthcareDripsError::MfaNotEnabled)
    }
    
    pub fn add_trusted_device(env: &Env, user: Address) -> Result<(), HealthcareDripsError> {
        user.require_auth();
        
        let security_key = Symbol::new(&env, &format!("security_{}", user));
        let mut security: UserSecurity = env.storage().instance()
            .get(&security_key)
            .ok_or(HealthcareDripsError::MfaNotEnabled)?;
            
        security.trusted_devices_count += 1;
        security.last_updated = env.ledger().timestamp();
        
        env.storage().instance().set(&security_key, &security);
        
        Ok(())
    }
    
    // ========== VIEW FUNCTIONS ==========
    
    pub fn get_premium_drip(env: &Env, drip_id: u64) -> Result<PremiumDrip, HealthcareDripsError> {
        env.storage().instance()
            .get(&Symbol::new(&env, &format!("drip_{}", drip_id)))
            .ok_or(HealthcareDripsError::InvalidIssueId)
    }
    
    pub fn get_issue(env: &Env, issue_id: u64) -> Result<Issue, HealthcareDripsError> {
        env.storage().instance()
            .get(&Symbol::new(&env, &format!("issue_{}", issue_id)))
            .ok_or(HealthcareDripsError::InvalidIssueId)
    }
    
    pub fn get_application(
        env: &Env,
        issue_id: u64,
        contributor: Address,
    ) -> Result<Application, HealthcareDripsError> {
        env.storage().instance()
            .get(&Symbol::new(&env, &format!("app_{}_{}", issue_id, contributor)))
            .ok_or(HealthcareDripsError::NotVerifiedContributor)
    }
    
    pub fn get_contributor_stats(
        env: &Env,
        contributor: Address,
    ) -> Result<ContributorStats, HealthcareDripsError> {
        env.storage().instance()
            .get(&Symbol::new(&env, &format!("stats_{}", contributor)))
            .ok_or(HealthcareDripsError::ContributorNotFound)
    }
    
    pub fn get_patient_premium_drips(env: &Env, patient: Address) -> Vec<u64> {
        env.storage().instance()
            .get(&Symbol::new(&env, &format!("patient_drips_{}", patient)))
            .unwrap_or(Vec::new(env))
    }
    
    pub fn get_patient_issues(env: &Env, patient: Address) -> Vec<u64> {
        env.storage().instance()
            .get(&Symbol::new(&env, &format!("patient_issues_{}", patient)))
            .unwrap_or(Vec::new(env))
    }
    
    pub fn get_active_issues(env: &Env) -> Vec<u64> {
        env.storage().instance()
            .get(&Symbol::short("active_issues"))
            .unwrap_or(Vec::new(env))
    }
    
    pub fn get_verified_contributors(env: &Env) -> Vec<Address> {
        env.storage().instance()
            .get(&Symbol::short("verified_contributors"))
            .unwrap_or(Vec::new(env))
    }
    
    pub fn get_issue_applications(env: &Env, issue_id: u64) -> Vec<Address> {
        env.storage().instance()
            .get(&Symbol::new(&env, &format!("applications_{}", issue_id)))
            .unwrap_or(Vec::new(env))
    }
    
    // ========== HELPER FUNCTIONS ==========
    
    fn get_next_drip_id(env: &Env) -> u64 {
        let key = Symbol::short("next_drip_id");
        let next_id = env.storage().instance().get(&key).unwrap_or(1u64);
        env.storage().instance().set(&key, &(next_id + 1));
        next_id
    }
    
    fn get_next_issue_id(env: &Env) -> u64 {
        let key = Symbol::short("next_issue_id");
        let next_id = env.storage().instance().get(&key).unwrap_or(1u64);
        env.storage().instance().set(&key, &(next_id + 1));
        next_id
    }
    
    fn get_next_record_id(env: &Env) -> u64 {
        let key = Symbol::short("next_record_id");
        let next_id = env.storage().instance().get(&key).unwrap_or(1u64);
        env.storage().instance().set(&key, &(next_id + 1));
        next_id
    }
    
    fn has_role(env: &Env, address: Address, role: Symbol) -> bool {
        env.storage().instance().get(&role) == Some(address)
    }
    
    fn is_verified_contributor(env: &Env, contributor: Address) -> bool {
        env.storage().instance().has(&Symbol::new(&env, &format!("stats_{}", contributor)))
    }
    
    fn get_contributor_reputation(env: &Env, contributor: Address) -> u32 {
        let stats_key = Symbol::new(&env, &format!("stats_{}", contributor));
        if let Some(stats) = env.storage().instance().get::<_, ContributorStats>(&stats_key) {
            stats.reputation
        } else {
            0
        }
    }
    
    fn update_contributor_stats(env: &Env, contributor: Address) {
        let stats_key = Symbol::new(&env, &format!("stats_{}", contributor));
        let stats = env.storage().instance()
            .get(&stats_key)
            .unwrap_or(ContributorStats {
                contributor: contributor.clone(),
                total_issues_reviewed: 0,
                total_issues_approved: 0,
                total_contributed: 0,
                level: ContributorLevel::Junior,
                reputation: 0,
                joined: env.ledger().timestamp(),
            });
        
        env.storage().instance().set(&stats_key, &stats);
    }
}
