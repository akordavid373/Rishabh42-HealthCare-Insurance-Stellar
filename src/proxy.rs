//! Proxy pattern + governance controls for Healthcare Drips on Soroban.
//!
//! Architecture
//! ============
//! ProxyContract  ──delegates──►  implementation address (stored in proxy storage)
//!      │
//!      └── GovernanceModule  (timelock + multi-sig proposals)
//!
//! Upgrade flow
//! ============
//! 1. Governance member calls propose_upgrade(new_impl, calldata)
//! 2. After TIMELOCK_PERIOD ledgers, any member calls execute_upgrade(proposal_id)
//! 3. ProxyContract updates IMPL_KEY → new address
//! 4. Optional migration hook is called on the new implementation
//! 5. Full audit record written to persistent storage
