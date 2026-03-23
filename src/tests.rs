#[cfg(test)]
mod tests {
    use soroban_sdk::{
        contract, contractimpl, contracttype, Address, Env, Symbol, testutils, Vec, String,
    };

    use crate::healthcare_drips::{
        HealthcareDrips, HealthcareDripsError, ContributorLevel, IssueType, IssueStatus,
        FraudRiskLevel, FraudFlag, FraudThresholds,
    };

    #[contract]
    struct TestContract;

    #[contractimpl]
    impl TestContract {
        pub fn test_token(env: &Env, admin: Address) {
            // Mock token for testing
        }
    }

    fn setup_contract() -> (Env, Address, Address, Address, Address, Address) {
        let env = Env::default();
        let admin = Address::random(&env);
        let patient = Address::random(&env);
        let insurer = Address::random(&env);
        let reviewer = Address::random(&env);
        let contributor = Address::random(&env);

        env.mock_all_auths();
        HealthcareDrips::initialize(&env, admin.clone());

        (env, admin, patient, insurer, reviewer, contributor)
    }

    #[test]
    fn test_initialization() {
        let (env, admin, _, _, _, _) = setup_contract();

        // Verify roles are set
        assert_eq!(
            env.storage().instance().get(&Symbol::short("IC")),
            Some(admin)
        );
        assert_eq!(
            env.storage().instance().get(&Symbol::short("RV")),
            Some(admin)
        );
        assert_eq!(
            env.storage().instance().get(&Symbol::short("AP")),
            Some(admin)
        );
    }

    #[test]
    fn test_create_premium_drip() {
        let (env, admin, patient, insurer, _, _) = setup_contract();
        let token = Address::random(&env);

        let result = HealthcareDrips::create_premium_drip(
            &env,
            patient.clone(),
            insurer.clone(),
            token,
            1000i128, // Premium amount
            86400u64,  // 1 day interval
        );

        assert_eq!(result, Ok(1));

        let drip = HealthcareDrips::get_premium_drip(&env, 1).unwrap();
        assert_eq!(drip.id, 1);
        assert_eq!(drip.patient, patient);
        assert_eq!(drip.insurer, insurer);
        assert_eq!(drip.premium_amount, 1000i128);
        assert_eq!(drip.interval, 86400u64);
        assert!(drip.active);
    }

    #[test]
    fn test_create_premium_drip_invalid_amount() {
        let (env, _, patient, insurer, _, _) = setup_contract();
        let token = Address::random(&env);

        let result = HealthcareDrips::create_premium_drip(
            &env,
            patient,
            insurer,
            token,
            0i128, // Invalid amount
            86400u64,
        );

        assert_eq!(result, Err(HealthcareDripsError::InvalidAmount));
    }

    #[test]
    fn test_process_premium_payment() {
        let (env, _, patient, insurer, _, _) = setup_contract();
        let token = Address::random(&env);

        // Create drip
        let drip_id = HealthcareDrips::create_premium_drip(
            &env,
            patient,
            insurer,
            token,
            1000i128,
            86400u64,
        ).unwrap();

        // Mock time passing
        env.ledger().set_timestamp(env.ledger().timestamp() + 86400u64 + 1);

        let result = HealthcareDrips::process_premium_payment(&env, drip_id);
        assert_eq!(result, Ok(()));

        let drip = HealthcareDrips::get_premium_drip(&env, drip_id).unwrap();
        assert_eq!(drip.total_paid, 1000i128);
    }

    #[test]
    fn test_create_issue() {
        let (env, admin, patient, _, _, _) = setup_contract();

        let result = HealthcareDrips::create_issue(
            &env,
            patient.clone(),
            IssueType::Surgery,
            String::from_str(&env, "Emergency Surgery"),
            String::from_str(&env, "Patient needs immediate surgery"),
            10000i128, // Funding amount
            String::from_str(&env, "QmHash123"),
            env.ledger().timestamp() + 86400 * 30, // 30 days deadline
            3u32, // Required approvals
            admin.clone(),
        );

        assert_eq!(result, Ok(1));

        let issue = HealthcareDrips::get_issue(&env, 1).unwrap();
        assert_eq!(issue.id, 1);
        assert_eq!(issue.creator, admin);
        assert_eq!(issue.patient, patient);
        assert_eq!(issue.issue_type, IssueType::Surgery);
        assert_eq!(issue.status, IssueStatus::Draft);
        assert_eq!(issue.required_approvals, 3u32);
    }

    #[test]
    fn test_create_issue_unauthorized() {
        let (env, _, patient, _, _, contributor) = setup_contract();

        let result = HealthcareDrips::create_issue(
            &env,
            patient,
            IssueType::Surgery,
            String::from_str(&env, "Emergency Surgery"),
            String::from_str(&env, "Patient needs immediate surgery"),
            10000i128,
            String::from_str(&env, "QmHash123"),
            env.ledger().timestamp() + 86400 * 30,
            3u32,
            contributor, // Not authorized
        );

        assert_eq!(result, Err(HealthcareDripsError::Unauthorized));
    }

    #[test]
    fn test_submit_issue() {
        let (env, admin, patient, _, _, _) = setup_contract();

        // Create issue
        let issue_id = HealthcareDrips::create_issue(
            &env,
            patient.clone(),
            IssueType::Surgery,
            String::from_str(&env, "Emergency Surgery"),
            String::from_str(&env, "Patient needs immediate surgery"),
            10000i128,
            String::from_str(&env, "QmHash123"),
            env.ledger().timestamp() + 86400 * 30,
            3u32,
            admin.clone(),
        ).unwrap();

        // Submit issue
        let result = HealthcareDrips::submit_issue(&env, issue_id, patient);
        assert_eq!(result, Ok(()));

        let issue = HealthcareDrips::get_issue(&env, issue_id).unwrap();
        assert_eq!(issue.status, IssueStatus::Submitted);
    }

    #[test]
    fn test_verify_contributor() {
        let (env, admin, _, _, _, contributor) = setup_contract();

        // First, the contributor needs to have some stats (created through application)
        // For this test, we'll manually create the stats first
        let stats = crate::healthcare_drips::ContributorStats {
            contributor: contributor.clone(),
            total_issues_reviewed: 0,
            total_issues_approved: 0,
            total_contributed: 0,
            level: ContributorLevel::Junior,
            reputation: 0,
            joined: env.ledger().timestamp(),
        };
        env.storage().instance().set(
            &Symbol::new(&env, &format!("stats_{}", contributor)),
            &stats,
        );

        let result = HealthcareDrips::verify_contributor(
            &env,
            contributor.clone(),
            ContributorLevel::Expert,
            admin,
        );

        assert_eq!(result, Ok(()));

        let updated_stats = HealthcareDrips::get_contributor_stats(&env, contributor).unwrap();
        assert_eq!(updated_stats.level, ContributorLevel::Expert);
        assert!(updated_stats.reputation >= 100);
    }

    #[test]
    fn test_apply_to_issue() {
        let (env, admin, patient, _, _, contributor) = setup_contract();

        // Create and submit issue
        let issue_id = HealthcareDrips::create_issue(
            &env,
            patient.clone(),
            IssueType::Surgery,
            String::from_str(&env, "Emergency Surgery"),
            String::from_str(&env, "Patient needs immediate surgery"),
            10000i128,
            String::from_str(&env, "QmHash123"),
            env.ledger().timestamp() + 86400 * 30,
            3u32,
            admin.clone(),
        ).unwrap();

        HealthcareDrips::submit_issue(&env, issue_id, patient).unwrap();

        // Verify contributor
        let stats = crate::healthcare_drips::ContributorStats {
            contributor: contributor.clone(),
            total_issues_reviewed: 0,
            total_issues_approved: 0,
            total_contributed: 0,
            level: ContributorLevel::Junior,
            reputation: 0,
            joined: env.ledger().timestamp(),
        };
        env.storage().instance().set(
            &Symbol::new(&env, &format!("stats_{}", contributor)),
            &stats,
        );

        // Apply to issue
        let result = HealthcareDrips::apply_to_issue(
            &env,
            issue_id,
            String::from_str(&env, "I can help with this surgery case"),
            contributor.clone(),
        );

        assert_eq!(result, Ok(()));

        let application = HealthcareDrips::get_application(&env, issue_id, contributor).unwrap();
        assert_eq!(application.contributor, contributor);
        assert_eq!(application.statement, String::from_str(&env, "I can help with this surgery case"));
        assert!(!application.approved);
    }

    #[test]
    fn test_review_application() {
        let (env, admin, patient, _, reviewer, contributor) = setup_contract();

        // Create and submit issue
        let issue_id = HealthcareDrips::create_issue(
            &env,
            patient.clone(),
            IssueType::Surgery,
            String::from_str(&env, "Emergency Surgery"),
            String::from_str(&env, "Patient needs immediate surgery"),
            10000i128,
            String::from_str(&env, "QmHash123"),
            env.ledger().timestamp() + 86400 * 30,
            2u32, // Only need 2 approvals for this test
            admin.clone(),
        ).unwrap();

        HealthcareDrips::submit_issue(&env, issue_id, patient).unwrap();

        // Verify contributor and apply
        let stats = crate::healthcare_drips::ContributorStats {
            contributor: contributor.clone(),
            total_issues_reviewed: 0,
            total_issues_approved: 0,
            total_contributed: 0,
            level: ContributorLevel::Junior,
            reputation: 0,
            joined: env.ledger().timestamp(),
        };
        env.storage().instance().set(
            &Symbol::new(&env, &format!("stats_{}", contributor)),
            &stats,
        );

        HealthcareDrips::apply_to_issue(
            &env,
            issue_id,
            String::from_str(&env, "I can help with this surgery case"),
            contributor.clone(),
        ).unwrap();

        // Review application positively
        let result = HealthcareDrips::review_application(
            &env,
            issue_id,
            contributor.clone(),
            true,
            String::from_str(&env, "Good expertise match"),
            reviewer.clone(),
        );

        assert_eq!(result, Ok(()));

        let application = HealthcareDrips::get_application(&env, issue_id, contributor).unwrap();
        assert!(application.approved);

        let updated_stats = HealthcareDrips::get_contributor_stats(&env, contributor).unwrap();
        assert_eq!(updated_stats.total_issues_reviewed, 1);
        assert_eq!(updated_stats.total_issues_approved, 1);
    }

    #[test]
    fn test_get_patient_issues() {
        let (env, admin, patient, _, _, _) = setup_contract();

        // Create multiple issues
        HealthcareDrips::create_issue(
            &env,
            patient.clone(),
            IssueType::Surgery,
            String::from_str(&env, "Surgery 1"),
            String::from_str(&env, "Description 1"),
            5000i128,
            String::from_str(&env, "QmHash1"),
            env.ledger().timestamp() + 86400 * 30,
            3u32,
            admin.clone(),
        ).unwrap();

        HealthcareDrips::create_issue(
            &env,
            patient.clone(),
            IssueType::EmergencyTreatment,
            String::from_str(&env, "Emergency 1"),
            String::from_str(&env, "Description 2"),
            3000i128,
            String::from_str(&env, "QmHash2"),
            env.ledger().timestamp() + 86400 * 30,
            3u32,
            admin.clone(),
        ).unwrap();

        let patient_issues = HealthcareDrips::get_patient_issues(&env, patient);
        assert_eq!(patient_issues.len(), 2);
        assert!(patient_issues.contains(&1));
        assert!(patient_issues.contains(&2));
    }

    #[test]
    fn test_get_active_issues() {
        let (env, admin, patient, _, _, _) = setup_contract();

        // Create and submit issue
        let issue_id = HealthcareDrips::create_issue(
            &env,
            patient.clone(),
            IssueType::Surgery,
            String::from_str(&env, "Emergency Surgery"),
            String::from_str(&env, "Patient needs immediate surgery"),
            10000i128,
            String::from_str(&env, "QmHash123"),
            env.ledger().timestamp() + 86400 * 30,
            3u32,
            admin.clone(),
        ).unwrap();

        HealthcareDrips::submit_issue(&env, issue_id, patient).unwrap();

        let active_issues = HealthcareDrips::get_active_issues(&env);
        assert_eq!(active_issues.len(), 1);
        assert!(active_issues.contains(&1));
    }

    // ========== FRAUD DETECTION TESTS ==========

    #[test]
    fn test_fraud_detection_initialization() {
        let (env, _, _, _, _, _) = setup_contract();

        // Check if fraud thresholds are initialized
        let thresholds = env.storage().instance()
            .get::<_, FraudThresholds>(&Symbol::short("fraud_thresholds"))
            .unwrap();
        
        assert_eq!(thresholds.max_monthly_claims, 5);
        assert_eq!(thresholds.max_single_claim_amount, 10000);
        assert_eq!(thresholds.risk_score_threshold, 50);
    }

    #[test]
    fn test_analyze_claim_fraud_low_risk() {
        let (env, admin, patient, _, _, _) = setup_contract();

        // Create a normal claim
        let issue_id = HealthcareDrips::create_issue(
            &env,
            patient.clone(),
            IssueType::Surgery,
            String::from_str(&env, "Normal Surgery"),
            String::from_str(&env, "Standard surgical procedure"),
            5000i128, // Normal amount
            String::from_str(&env, "QmHash123"),
            env.ledger().timestamp() + 86400 * 30,
            3u32,
            admin.clone(),
        ).unwrap();

        // Analyze for fraud
        let analysis = HealthcareDrips::analyze_claim_fraud(&env, issue_id).unwrap();
        
        assert_eq!(analysis.risk_level, FraudRiskLevel::Low);
        assert!(analysis.risk_score < 20);
        assert!(!analysis.requires_review);
        assert!(!analysis.anomaly_detected);
    }

    #[test]
    fn test_analyze_claim_fraud_high_amount() {
        let (env, admin, patient, _, _, _) = setup_contract();

        // Create a high-value claim
        let issue_id = HealthcareDrips::create_issue(
            &env,
            patient.clone(),
            IssueType::Surgery,
            String::from_str(&env, "Expensive Surgery"),
            String::from_str(&env, "High-cost surgical procedure"),
            15000i128, // High amount above threshold
            String::from_str(&env, "QmHash123"),
            env.ledger().timestamp() + 86400 * 30,
            3u32,
            admin.clone(),
        ).unwrap();

        // Analyze for fraud
        let analysis = HealthcareDrips::analyze_claim_fraud(&env, issue_id).unwrap();
        
        assert!(analysis.risk_score >= 25);
        assert!(analysis.flags.iter().any(|&flag| flag == FraudFlag::UnusualAmount));
    }

    #[test]
    fn test_analyze_claim_pattern_new_patient() {
        let (env, _, patient, _, _, _) = setup_contract();

        // Analyze claim pattern for new patient
        let pattern = HealthcareDrips::analyze_claim_pattern(&env, patient.clone()).unwrap();
        
        assert_eq!(pattern.claim_frequency, 0);
        assert_eq!(pattern.average_amount, 0);
        assert_eq!(pattern.total_claimed, 0);
        assert_eq!(pattern.unique_providers, 0);
        assert!(pattern.claim_types.is_empty());
        assert_eq!(pattern.risk_score, 0);
    }

    #[test]
    fn test_analyze_claim_pattern_multiple_claims() {
        let (env, admin, patient, _, _, _) = setup_contract();

        // Create multiple claims for the same patient
        for i in 1..=3 {
            HealthcareDrips::create_issue(
                &env,
                patient.clone(),
                IssueType::Surgery,
                String::from_str(&env, &format!("Surgery {}", i)),
                String::from_str(&env, &format!("Description {}", i)),
                3000i128 + (i as i128 * 1000),
                String::from_str(&env, &format!("QmHash{}", i)),
                env.ledger().timestamp() + 86400 * 30,
                3u32,
                admin.clone(),
            ).unwrap();
        }

        // Analyze claim pattern
        let pattern = HealthcareDrips::analyze_claim_pattern(&env, patient.clone()).unwrap();
        
        assert_eq!(pattern.claim_frequency, 3);
        assert!(pattern.average_amount > 0);
        assert!(pattern.total_claimed > 0);
        assert_eq!(pattern.unique_providers, 1); // Same admin
        assert_eq!(pattern.claim_types.len(), 1); // All Surgery type
    }

    #[test]
    fn test_detect_pattern_anomaly() {
        let (env, admin, patient, _, _, _) = setup_contract();

        // Create a pattern of normal claims
        for i in 1..=3 {
            HealthcareDrips::create_issue(
                &env,
                patient.clone(),
                IssueType::Surgery,
                String::from_str(&env, &format!("Surgery {}", i)),
                String::from_str(&env, &format!("Description {}", i)),
                5000i128, // Consistent amount
                String::from_str(&env, &format!("QmHash{}", i)),
                env.ledger().timestamp() + 86400 * 30,
                3u32,
                admin.clone(),
            ).unwrap();
        }

        // Get pattern
        let pattern = HealthcareDrips::analyze_claim_pattern(&env, patient.clone()).unwrap();
        
        // Create a claim with significantly different amount
        let anomaly_issue_id = HealthcareDrips::create_issue(
            &env,
            patient.clone(),
            IssueType::Surgery,
            String::from_str(&env, "Anomaly Surgery"),
            String::from_str(&env, "Very expensive surgery"),
            20000i128, // Much higher amount
            String::from_str(&env, "QmHashAnomaly"),
            env.ledger().timestamp() + 86400 * 30,
            3u32,
            admin.clone(),
        ).unwrap();

        let anomaly_issue = HealthcareDrips::get_issue(&env, anomaly_issue_id).unwrap();
        
        // Detect anomaly
        let is_anomaly = HealthcareDrips::detect_pattern_anomaly(&env, &pattern, &anomaly_issue);
        assert!(is_anomaly); // Should detect the amount anomaly
    }

    #[test]
    fn test_detect_timing_anomaly() {
        let (env, admin, patient, _, _, _) = setup_contract();

        // Create multiple claims in quick succession
        let base_time = env.ledger().timestamp();
        
        for i in 1..=4 {
            // Set time to create claims within the same day
            env.ledger().set_timestamp(base_time + (i as u64 * 3600)); // 1 hour apart
            
            HealthcareDrips::create_issue(
                &env,
                patient.clone(),
                IssueType::EmergencyTreatment,
                String::from_str(&env, &format!("Emergency {}", i)),
                String::from_str(&env, &format!("Emergency description {}", i)),
                1000i128,
                String::from_str(&env, &format!("QmHash{}", i)),
                env.ledger().timestamp() + 86400 * 30,
                3u32,
                admin.clone(),
            ).unwrap();
        }

        // Check for timing anomaly with the last claim
        let is_anomaly = HealthcareDrips::detect_timing_anomaly(&env, patient.clone(), base_time + 4 * 3600);
        assert!(is_anomaly); // Should detect timing anomaly (4 claims in 4 hours)
    }

    #[test]
    fn test_flag_high_risk_claims() {
        let (env, admin, patient, _, _, _) = setup_contract();

        // Create a high-risk claim
        let issue_id = HealthcareDrips::create_issue(
            &env,
            patient.clone(),
            IssueType::Surgery,
            String::from_str(&env, "High Risk Surgery"),
            String::from_str(&env, "Very expensive procedure"),
            20000i128, // High amount
            String::from_str(&env, "QmHash123"),
            env.ledger().timestamp() + 86400 * 30,
            3u32,
            admin.clone(),
        ).unwrap();

        // Try to flag the claim
        let result = HealthcareDrips::flag_high_risk_claims(&env, issue_id);
        
        // Should be flagged due to high amount
        assert_eq!(result, Err(HealthcareDripsError::ClaimFlagged));
        
        // Check if claim is in flagged list
        let flagged_claims = HealthcareDrips::get_flagged_claims(&env);
        assert!(flagged_claims.contains(&issue_id));
        
        // Check if issue status was updated
        let issue = HealthcareDrips::get_issue(&env, issue_id).unwrap();
        assert_eq!(issue.status, IssueStatus::UnderReview);
    }

    #[test]
    fn test_submit_issue_with_fraud_detection() {
        let (env, admin, patient, _, _, _) = setup_contract();

        // Create a normal claim
        let issue_id = HealthcareDrips::create_issue(
            &env,
            patient.clone(),
            IssueType::Surgery,
            String::from_str(&env, "Normal Surgery"),
            String::from_str(&env, "Standard procedure"),
            5000i128,
            String::from_str(&env, "QmHash123"),
            env.ledger().timestamp() + 86400 * 30,
            3u32,
            admin.clone(),
        ).unwrap();

        // Submit issue (should pass fraud detection)
        let result = HealthcareDrips::submit_issue(&env, issue_id, patient.clone());
        assert_eq!(result, Ok(()));
        
        let issue = HealthcareDrips::get_issue(&env, issue_id).unwrap();
        assert_eq!(issue.status, IssueStatus::Submitted);
        
        // Create a high-risk claim
        let high_risk_id = HealthcareDrips::create_issue(
            &env,
            patient.clone(),
            IssueType::Surgery,
            String::from_str(&env, "High Risk Surgery"),
            String::from_str(&env, "Very expensive procedure"),
            20000i128, // High amount
            String::from_str(&env, "QmHash456"),
            env.ledger().timestamp() + 86400 * 30,
            3u32,
            admin.clone(),
        ).unwrap();

        // Submit high-risk issue (should be flagged)
        let result = HealthcareDrips::submit_issue(&env, high_risk_id, patient.clone());
        assert_eq!(result, Ok(())); // Still succeeds but gets flagged
        
        let high_risk_issue = HealthcareDrips::get_issue(&env, high_risk_id).unwrap();
        assert_eq!(high_risk_issue.status, IssueStatus::UnderReview);
    }

    #[test]
    fn test_update_fraud_thresholds() {
        let (env, admin, _, _, _, _) = setup_contract();

        // Update thresholds
        let new_thresholds = FraudThresholds {
            max_monthly_claims: 10,
            max_single_claim_amount: 20000,
            risk_score_threshold: 60,
            frequency_penalty: 15,
            amount_penalty: 25,
            pattern_penalty: 35,
        };

        let result = HealthcareDrips::update_fraud_thresholds(&env, new_thresholds.clone(), admin.clone());
        assert_eq!(result, Ok(()));

        // Try with unauthorized user
        let unauthorized = Address::random(&env);
        let result = HealthcareDrips::update_fraud_thresholds(&env, new_thresholds, unauthorized);
        assert_eq!(result, Err(HealthcareDripsError::Unauthorized));
    }

    #[test]
    fn test_remove_flagged_claim() {
        let (env, admin, patient, _, reviewer, _) = setup_contract();

        // Create and flag a high-risk claim
        let issue_id = HealthcareDrips::create_issue(
            &env,
            patient.clone(),
            IssueType::Surgery,
            String::from_str(&env, "High Risk Surgery"),
            String::from_str(&env, "Very expensive procedure"),
            20000i128,
            String::from_str(&env, "QmHash123"),
            env.ledger().timestamp() + 86400 * 30,
            3u32,
            admin.clone(),
        ).unwrap();

        HealthcareDrips::flag_high_risk_claims(&env, issue_id).unwrap_err(); // Expect error due to flagging
        
        // Verify it's flagged
        let flagged_claims = HealthcareDrips::get_flagged_claims(&env);
        assert!(flagged_claims.contains(&issue_id));

        // Remove from flagged list (as reviewer)
        let result = HealthcareDrips::remove_flagged_claim(&env, issue_id, reviewer.clone());
        assert_eq!(result, Ok(()));

        // Verify it's no longer flagged
        let flagged_claims = HealthcareDrips::get_flagged_claims(&env);
        assert!(!flagged_claims.contains(&issue_id));

        // Try with unauthorized user
        let unauthorized = Address::random(&env);
        let result = HealthcareDrips::remove_flagged_claim(&env, issue_id, unauthorized);
        assert_eq!(result, Err(HealthcareDripsError::Unauthorized));
    }

    #[test]
    fn test_get_fraud_analysis() {
        let (env, admin, patient, _, _, _) = setup_contract();

        // Create a claim
        let issue_id = HealthcareDrips::create_issue(
            &env,
            patient.clone(),
            IssueType::Surgery,
            String::from_str(&env, "Test Surgery"),
            String::from_str(&env, "Test description"),
            5000i128,
            String::from_str(&env, "QmHash123"),
            env.ledger().timestamp() + 86400 * 30,
            3u32,
            admin.clone(),
        ).unwrap();

        // Analyze for fraud
        let analysis = HealthcareDrips::analyze_claim_fraud(&env, issue_id).unwrap();
        
        // Retrieve the analysis
        let retrieved_analysis = HealthcareDrips::get_fraud_analysis(&env, issue_id).unwrap();
        
        assert_eq!(analysis.issue_id, retrieved_analysis.issue_id);
        assert_eq!(analysis.risk_score, retrieved_analysis.risk_score);
        assert_eq!(analysis.risk_level, retrieved_analysis.risk_level);
    }
}
