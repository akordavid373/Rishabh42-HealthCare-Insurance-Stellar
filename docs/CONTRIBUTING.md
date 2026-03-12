# Contributing to Healthcare Drips

Thank you for your interest in contributing to Healthcare Drips! This guide will help you get started.

## 🎯 Our Mission

We're building a decentralized healthcare platform that:
- Enables recurring insurance premium payments
- Empowers contributor-driven claim approvals
- Provides transparent medical funding
- Revolutionizes healthcare insurance with Web3

## 🤝 How to Contribute

### 🐛 Reporting Issues

We use GitHub Issues to track bugs and feature requests:

**Bug Reports:**
- Use the "Bug Report" template
- Include steps to reproduce
- Add browser and wallet info
- Attach screenshots if applicable

**Feature Requests:**
- Use the "Feature Request" template
- Describe the use case clearly
- Explain why it's valuable
- Consider implementation complexity

### 💻 Development Setup

1. **Fork the Repository**
   ```bash
   git clone https://github.com/your-username/healthcare-drips.git
   cd healthcare-drips
   ```

2. **Install Dependencies**
   ```bash
   # Frontend
   cd frontend
   npm install
   
   # Smart Contracts
   npm install
   ```

3. **Development Environment**
   ```bash
   # Start local blockchain
   npx hardhat node
   
   # Deploy contracts locally
   npm run deploy
   
   # Start frontend
   cd frontend && npm start
   ```

### 🧪 Testing

**Smart Contracts:**
```bash
# Run contract tests
npx hardhat test

# Run specific test file
npx hardhat test test/PremiumDrip.test.js
```

**Frontend:**
```bash
# Run frontend tests
cd frontend && npm test

# Run with coverage
cd frontend && npm test -- --coverage
```

### 📝 Code Style

**Smart Contracts:**
- Use Solidity 0.8.0+
- Follow OpenZeppelin standards
- Add comprehensive comments
- Include NatSpec documentation

**Frontend:**
- Use ES6+ features
- Follow React best practices
- Use Tailwind for styling
- Add JSDoc comments

### 🌿 Development Workflow

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Changes**
   - Write clean, readable code
   - Add tests for new features
   - Update documentation

3. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: add premium drip automation"
   ```

4. **Push and Create PR**
   ```bash
   git push origin feature/your-feature-name
   # Create Pull Request on GitHub
   ```

## 🏗️ Project Structure

```
healthcare-drips/
├── contracts/
│   ├── src/
│   │   ├── HealthcareDrips.sol     # Main contract
│   │   └── ContributorToken.sol    # Governance token
│   └── test/                     # Contract tests
├── frontend/
│   ├── src/
│   │   ├── components/              # React components
│   │   ├── hooks/                  # Custom hooks
│   │   └── utils/                  # Utilities
│   └── public/                     # Static assets
├── scripts/
│   ├── deploy.js                   # Deployment script
│   └── helpers/                    # Helper functions
└── docs/
    ├── API.md                       # API documentation
    └── DEPLOYMENT.md                 # Deployment guide
```

## 🎯 Areas to Contribute

### 🏥 **Smart Contract Development**
- **Premium Drips**: Enhance recurring payment logic
- **Funding Requests**: Improve community funding
- **Claims Processing**: Optimize multi-sig approvals
- **Security**: Add new security features

### 🌐 **Frontend Development**
- **Patient Dashboard**: Improve user experience
- **Contributor Portal**: Enhance governance UI
- **Mobile App**: React Native implementation
- **Analytics**: Add data visualization

### 📚 **Documentation**
- **API Docs**: Improve technical documentation
- **User Guides**: Write helpful tutorials
- **Security**: Document security practices
- **Deployment**: Update deployment guides

### 🧪 **Testing**
- **Unit Tests**: Increase test coverage
- **Integration Tests**: Add end-to-end tests
- **Security Audits**: Help with security reviews
- **Performance**: Optimize gas usage

## 🏆 Contribution Rewards

We reward meaningful contributions with HCT tokens:

**Rewards Tiers:**
- 🥉 **Bronze** (1-5 contributions): 100 HCT
- 🥈 **Silver** (6-15 contributions): 500 HCT  
- 🥇 **Gold** (16-30 contributions): 1,500 HCT
- 💎 **Diamond** (31+ contributions): 3,000 HCT

**Contribution Types:**
- Code contributions
- Bug reports
- Documentation improvements
- Community support
- Security findings

## 📋 Pull Request Process

### Before Submitting
- [ ] Tests pass locally
- [ ] Code follows style guidelines
- [ ] Self-reviewed the code
- [ ] Documentation updated
- [ ] No merge conflicts

### PR Template
```markdown
## Description
Brief description of changes

## Type
- [ ] Bug fix
- [ ] Feature
- [ ] Documentation
- [ ] Other

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Ready for review
```

## 🔒 Security Guidelines

- Never commit private keys or sensitive data
- Follow secure coding practices
- Report security issues privately
- Use HTTPS for all communications
- Verify contract addresses before interaction

## 📞 Getting Help

- **Discord**: [Join our community](https://discord.gg/healthcare-drips)
- **GitHub Discussions**: [Ask questions](https://github.com/your-org/healthcare-drips/discussions)
- **Email**: security@healthcare-drips.com (for security issues only)

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to Healthcare Drips!** 🏥💫

Every contribution helps make healthcare more accessible and transparent for everyone.
