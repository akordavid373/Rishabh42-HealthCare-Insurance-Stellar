const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("🚀 Deploying Healthcare Drips Platform...");
    
    const [deployer] = await ethers.getSigners();
    console.log("📡 Deploying contracts with account:", deployer.address);
    
    // Deploy ContributorToken first
    console.log("🪙 Deploying ContributorToken (HCT)...");
    const ContributorToken = await ethers.getContractFactory("ContributorToken");
    const contributorToken = await ContributorToken.deploy();
    await contributorToken.deployed();
    console.log("✅ ContributorToken deployed to:", contributorToken.address);
    
    // Deploy HealthcareDrips
    console.log("🏥 Deploying HealthcareDrips...");
    const HealthcareDrips = await ethers.getContractFactory("HealthcareDrips");
    const healthcareDrips = await HealthcareDrips.deploy();
    await healthcareDrips.deployed();
    console.log("✅ HealthcareDrips deployed to:", healthcareDrips.address);
    
    // Setup roles
    console.log("🔐 Setting up roles...");
    const INSURER_ADMIN = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("INSURER_ADMIN"));
    const HOSPITAL_ADMIN = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("HOSPITAL_ADMIN"));
    const LAB_ADMIN = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("LAB_ADMIN"));
    const CONTRIBUTOR = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("CONTRIBUTOR"));
    
    // Grant roles to test accounts (for development)
    const [_, insurer, hospital, lab, contributor1, contributor2] = await ethers.getSigners();
    
    await healthcareDrips.grantRole(INSURER_ADMIN, insurer.getAddress());
    await healthcareDrips.grantRole(HOSPITAL_ADMIN, hospital.getAddress());
    await healthcareDrips.grantRole(LAB_ADMIN, lab.getAddress());
    await healthcareDrips.grantRole(CONTRIBUTOR, contributor1.getAddress());
    await healthcareDrips.grantRole(CONTRIBUTOR, contributor2.getAddress());
    
    console.log("✅ Roles granted successfully");
    
    // Save deployment info
    const deploymentInfo = {
        network: hre.network.name,
        deployer: deployer.address,
        contracts: {
            ContributorToken: contributorToken.address,
            HealthcareDrips: healthcareDrips.address
        },
        deployedAt: new Date().toISOString(),
        roles: {
            INSURER_ADMIN: insurer.getAddress(),
            HOSPITAL_ADMIN: hospital.getAddress(),
            LAB_ADMIN: lab.getAddress(),
            CONTRIBUTOR: contributor1.getAddress()
        }
    };
    
    const deploymentPath = path.join(__dirname, "..", "deployment.json");
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    console.log("📋 Deployment info saved to:", deploymentPath);
    
    console.log("🎉 Deployment completed successfully!");
    console.log("");
    console.log("Contract Addresses:");
    console.log("- ContributorToken (HCT):", contributorToken.address);
    console.log("- HealthcareDrips:", healthcareDrips.address);
    console.log("");
    console.log("Next Steps:");
    console.log("1. Update frontend with contract addresses");
    console.log("2. Run: npm run start");
    console.log("3. Connect with MetaMask and test the dApp");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
