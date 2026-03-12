// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title Healthcare Drips - Medical Insurance with Recurring Payments
 * @dev Enables recurring premium payments and contributor-driven claim management
 */
contract HealthcareDrips is ReentrancyGuard, AccessControl {
    
    // ========== ROLES ==========
    bytes32 public constant INSURER_ADMIN = keccak256("INSURER_ADMIN");
    bytes32 public constant HOSPITAL_ADMIN = keccak256("HOSPITAL_ADMIN");
    bytes32 public constant LAB_ADMIN = keccak256("LAB_ADMIN");
    bytes32 public constant CONTRIBUTOR = keccak256("CONTRIBUTOR");
    
    // ========== STRUCTS ==========
    
    struct PremiumDrip {
        uint256 id;
        address patient;
        address insurer;
        address token;
        uint256 premiumAmount;
        uint256 interval; // in seconds
        uint256 lastPayment;
        uint256 nextPayment;
        bool active;
        uint256 totalPaid;
        uint256 created;
    }
    
    struct FundingRequest {
        uint256 id;
        address patient;
        string treatmentType;
        uint256 amount;
        string description;
        uint256 deadline;
        address[] contributors;
        mapping(address => bool) hasContributed;
        mapping(address => uint256) contributions;
        uint256 totalRaised;
        bool active;
        uint256 created;
    }
    
    struct InsuranceClaim {
        uint256 id;
        address patient;
        uint256 amount;
        string description;
        string medicalRecord; // IPFS hash
        address[] requiredApprovers;
        mapping(address => bool) approvals;
        uint256 approvalCount;
        bool processed;
        uint256 processedAmount;
        uint256 created;
    }
    
    struct ContributorProfile {
        address contributor;
        uint256 reputation;
        uint256 totalContributed;
        uint256 claimsReviewed;
        uint256 created;
    }
    
    // ========== STORAGE ==========
    
    mapping(uint256 => PremiumDrip) public premiumDrips;
    mapping(address => uint256[]) public patientPremiumDrips;
    uint256 public nextPremiumDripId;
    
    mapping(uint256 => FundingRequest) public fundingRequests;
    mapping(address => uint256[]) public contributorRequests;
    uint256 public nextFundingRequestId;
    
    mapping(uint256 => InsuranceClaim) public insuranceClaims;
    mapping(address => uint256[]) public patientClaims;
    uint256 public nextClaimId;
    
    mapping(address => ContributorProfile) public contributorProfiles;
    address[] public contributors;
    
    // ========== EVENTS ==========
    
    event PremiumDripCreated(uint256 indexed id, address indexed patient, address indexed insurer, uint256 amount, uint256 interval);
    event PremiumPaymentProcessed(uint256 indexed id, uint256 amount, uint256 timestamp);
    event FundingRequestCreated(uint256 indexed id, address indexed patient, string treatmentType, uint256 amount);
    event ContributionMade(uint256 indexed requestId, address indexed contributor, uint256 amount);
    event ClaimSubmitted(uint256 indexed id, address indexed patient, uint256 amount);
    event ClaimApproved(uint256 indexed id, address indexed approver);
    event ClaimProcessed(uint256 indexed id, uint256 amount);
    event ContributorRegistered(address indexed contributor);
    
    // ========== MODIFIERS ==========
    
    modifier onlyRole(bytes32 role) {
        require(hasRole(role, msg.sender), "HealthcareDrips: INSUFFICIENT_PERMISSIONS");
        _;
    }
    
    modifier validAddress(address addr) {
        require(addr != address(0), "HealthcareDrips: INVALID_ADDRESS");
        _;
    }
    
    modifier onlyPatient(uint256 dripId) {
        require(premiumDrips[dripId].patient == msg.sender, "HealthcareDrips: NOT_DRIP_OWNER");
        _;
    }
    
    // ========== CONSTRUCTOR ==========
    
    constructor() {
        _grantRole(msg.sender, DEFAULT_ADMIN_ROLE);
        nextPremiumDripId = 1;
        nextFundingRequestId = 1;
        nextClaimId = 1;
    }
    
    // ========== PREMIUM DRIPS FUNCTIONS ==========
    
    /**
     * @dev Create a new premium drip for recurring insurance payments
     */
    function createPremiumDrip(
        address _patient,
        address _insurer,
        address _token,
        uint256 _premiumAmount,
        uint256 _interval
    ) external validAddress(_patient) validAddress(_insurer) validAddress(_token) returns (uint256) {
        require(_premiumAmount > 0, "HealthcareDrips: INVALID_AMOUNT");
        require(_interval >= 86400, "HealthcareDrips: INVALID_INTERVAL"); // min 1 day
        
        uint256 dripId = nextPremiumDripId++;
        
        premiumDrips[dripId] = PremiumDrip({
            id: dripId,
            patient: _patient,
            insurer: _insurer,
            token: _token,
            premiumAmount: _premiumAmount,
            interval: _interval,
            lastPayment: block.timestamp,
            nextPayment: block.timestamp + _interval,
            active: true,
            totalPaid: 0,
            created: block.timestamp
        });
        
        patientPremiumDrips[_patient].push(dripId);
        
        emit PremiumDripCreated(dripId, _patient, _insurer, _premiumAmount, _interval);
        return dripId;
    }
    
    /**
     * @dev Process premium payments for active drips
     */
    function processPremiumPayment(uint256 _dripId) external nonReentrant {
        PremiumDrip storage drip = premiumDrips[_dripId];
        require(drip.active, "HealthcareDrips: DRIP_INACTIVE");
        require(block.timestamp >= drip.nextPayment, "HealthcareDrips: PAYMENT_NOT_DUE");
        
        // Transfer tokens from insurer to contract (simplified - would use actual token transfer)
        // IERC20(drip.token).transferFrom(drip.insurer, address(this), drip.premiumAmount);
        
        drip.lastPayment = block.timestamp;
        drip.nextPayment = block.timestamp + drip.interval;
        drip.totalPaid += drip.premiumAmount;
        
        emit PremiumPaymentProcessed(_dripId, drip.premiumAmount, block.timestamp);
    }
    
    /**
     * @dev Cancel a premium drip
     */
    function cancelPremiumDrip(uint256 _dripId) external onlyPatient(_dripId) {
        PremiumDrip storage drip = premiumDrips[_dripId];
        drip.active = false;
    }
    
    // ========== FUNDING REQUESTS FUNCTIONS ==========
    
    /**
     * @dev Create a new funding request for medical treatment
     */
    function createFundingRequest(
        string memory _treatmentType,
        uint256 _amount,
        string memory _description,
        uint256 _deadline,
        address[] memory _contributors
    ) external validAddress(msg.sender) returns (uint256) {
        require(_amount > 0, "HealthcareDrips: INVALID_AMOUNT");
        require(_deadline > block.timestamp, "HealthcareDrips: INVALID_DEADLINE");
        
        uint256 requestId = nextFundingRequestId++;
        
        fundingRequests[requestId] = FundingRequest({
            id: requestId,
            patient: msg.sender,
            treatmentType: _treatmentType,
            amount: _amount,
            description: _description,
            deadline: _deadline,
            contributors: _contributors,
            totalRaised: 0,
            active: true,
            created: block.timestamp
        });
        
        // Notify contributors
        for (uint i = 0; i < _contributors.length; i++) {
            contributorRequests[_contributors[i]].push(requestId);
        }
        
        emit FundingRequestCreated(requestId, msg.sender, _treatmentType, _amount);
        return requestId;
    }
    
    /**
     * @dev Contribute to a funding request
     */
    function contributeToFunding(uint256 _requestId, uint256 _amount) external {
        FundingRequest storage request = fundingRequests[_requestId];
        require(request.active, "HealthcareDrips: REQUEST_INACTIVE");
        require(block.timestamp < request.deadline, "HealthcareDrips: DEADLINE_EXPIRED");
        require(!request.hasContributed[msg.sender], "HealthcareDrips: ALREADY_CONTRIBUTED");
        require(_amount > 0, "HealthcareDrips: INVALID_AMOUNT");
        
        // Transfer tokens (simplified)
        // IERC20(token).transferFrom(msg.sender, address(this), _amount);
        
        request.hasContributed[msg.sender] = true;
        request.contributions[msg.sender] = _amount;
        request.totalRaised += _amount;
        
        // Update contributor profile
        if (contributorProfiles[msg.sender].contributor == address(0)) {
            contributorProfiles[msg.sender] = ContributorProfile({
                contributor: msg.sender,
                reputation: 0,
                totalContributed: _amount,
                claimsReviewed: 0,
                created: block.timestamp
            });
            contributors.push(msg.sender);
            emit ContributorRegistered(msg.sender);
        } else {
            contributorProfiles[msg.sender].totalContributed += _amount;
        }
        
        emit ContributionMade(_requestId, msg.sender, _amount);
    }
    
    // ========== INSURANCE CLAIMS FUNCTIONS ==========
    
    /**
     * @dev Submit a new insurance claim
     */
    function submitClaim(
        uint256 _amount,
        string memory _description,
        string memory _medicalRecord,
        address[] memory _requiredApprovers
    ) external validAddress(msg.sender) returns (uint256) {
        require(_amount > 0, "HealthcareDrips: INVALID_AMOUNT");
        require(_requiredApprovers.length >= 2, "HealthcareDrips: INSUFFICIENT_APPROVERS");
        
        uint256 claimId = nextClaimId++;
        
        insuranceClaims[claimId] = InsuranceClaim({
            id: claimId,
            patient: msg.sender,
            amount: _amount,
            description: _description,
            medicalRecord: _medicalRecord,
            requiredApprovers: _requiredApprovers,
            approvalCount: 0,
            processed: false,
            processedAmount: 0,
            created: block.timestamp
        });
        
        patientClaims[msg.sender].push(claimId);
        
        emit ClaimSubmitted(claimId, msg.sender, _amount);
        return claimId;
    }
    
    /**
     * @dev Approve an insurance claim (for authorized approvers)
     */
    function approveClaim(uint256 _claimId) external {
        InsuranceClaim storage claim = insuranceClaims[_claimId];
        require(!claim.processed, "HealthcareDrips: CLAIM_ALREADY_PROCESSED");
        
        bool isRequiredApprover = false;
        for (uint i = 0; i < claim.requiredApprovers.length; i++) {
            if (claim.requiredApprovers[i] == msg.sender) {
                isRequiredApprover = true;
                break;
            }
        }
        require(isRequiredApprover, "HealthcareDrips: NOT_AUTHORIZED_APPROVER");
        require(!claim.approvals[msg.sender], "HealthcareDrips: ALREADY_APPROVED");
        
        claim.approvals[msg.sender] = true;
        claim.approvalCount++;
        
        emit ClaimApproved(_claimId, msg.sender);
        
        // Auto-process if all approvals received
        if (claim.approvalCount >= claim.requiredApprovers.length) {
            _processClaim(_claimId);
        }
    }
    
    /**
     * @dev Internal function to process approved claims
     */
    function _processClaim(uint256 _claimId) internal {
        InsuranceClaim storage claim = insuranceClaims[_claimId];
        claim.processed = true;
        claim.processedAmount = claim.amount;
        
        // Update contributor profiles
        for (uint i = 0; i < claim.requiredApprovers.length; i++) {
            address approver = claim.requiredApprovers[i];
            if (contributorProfiles[approver].contributor != address(0)) {
                contributorProfiles[approver].claimsReviewed++;
                contributorProfiles[approver].reputation += 10; // Reward for reviewing
            }
        }
        
        emit ClaimProcessed(_claimId, claim.amount);
    }
    
    // ========== VIEW FUNCTIONS ==========
    
    function getPatientPremiumDrips(address _patient) external view returns (uint256[] memory) {
        return patientPremiumDrips[_patient];
    }
    
    function getActiveFundingRequests() external view returns (uint256[] memory) {
        uint256[] memory activeRequests = new uint256[](nextFundingRequestId);
        uint256 count = 0;
        
        for (uint i = 1; i < nextFundingRequestId; i++) {
            if (fundingRequests[i].active && block.timestamp < fundingRequests[i].deadline) {
                activeRequests[count] = i;
                count++;
            }
        }
        
        // Resize array to actual count
        assembly {
            mstore(activeRequests, count)
        }
        
        return activeRequests;
    }
    
    function getContributorProfile(address _contributor) external view returns (ContributorProfile memory) {
        return contributorProfiles[_contributor];
    }
    
    function getAllContributors() external view returns (address[] memory) {
        return contributors;
    }
    
    function isPremiumDripActive(uint256 _dripId) external view returns (bool) {
        return premiumDrips[_dripId].active;
    }
    
    function getNextPaymentTime(uint256 _dripId) external view returns (uint256) {
        return premiumDrips[_dripId].nextPayment;
    }
}
