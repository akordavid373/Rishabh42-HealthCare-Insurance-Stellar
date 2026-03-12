// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Healthcare Contributor Token (HCT)
 * @dev Governance and rewards token for healthcare platform contributors
 */
contract ContributorToken is ERC20, Ownable {
    
    // ========== EVENTS ==========
    event TokensMinted(address indexed to, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);
    event RewardsDistributed(address indexed contributor, uint256 amount, string reason);
    
    // ========== CONSTRUCTOR ==========
    
    constructor() ERC20("Healthcare Contributor Token", "HCT") {
        // Mint initial supply for platform rewards
        _mint(msg.sender, 1000000 * 10**18); // 1M tokens for ecosystem
    }
    
    // ========== MINTING FUNCTIONS ==========
    
    /**
     * @dev Mint tokens for rewards (only owner)
     */
    function mintRewards(address _to, uint256 _amount, string memory _reason) external onlyOwner {
        _mint(_to, _amount);
        emit TokensMinted(_to, _amount);
        emit RewardsDistributed(_to, _amount, _reason);
    }
    
    /**
     * @dev Mint tokens for community rewards
     */
    function distributeCommunityRewards(address[] memory _contributors, uint256[] memory _amounts, string memory _reason) external onlyOwner {
        require(_contributors.length == _amounts.length, "ContributorToken: ARRAY_LENGTH_MISMATCH");
        
        for (uint i = 0; i < _contributors.length; i++) {
            _mint(_contributors[i], _amounts[i]);
            emit TokensMinted(_contributors[i], _amounts[i]);
            emit RewardsDistributed(_contributors[i], _amounts[i], _reason);
        }
    }
    
    // ========== BURNING FUNCTIONS ==========
    
    /**
     * @dev Burn tokens for governance actions
     */
    function burn(uint256 _amount) external {
        _burn(msg.sender, _amount);
        emit TokensBurned(msg.sender, _amount);
    }
    
    /**
     * @dev Burn tokens from account (only owner)
     */
    function burnFrom(address _account, uint256 _amount) external onlyOwner {
        _burn(_account, _amount);
        emit TokensBurned(_account, _amount);
    }
    
    // ========== VIEW FUNCTIONS ==========
    
    function getTotalSupply() external view returns (uint256) {
        return totalSupply();
    }
    
    function getBalance(address _account) external view returns (uint256) {
        return balanceOf(_account);
    }
}
