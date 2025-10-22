# 🎨 Blockchain-based Commissioned Works Platform

Welcome to a decentralized platform that revolutionizes freelance creative work! This project addresses real-world problems in the gig economy, such as payment disputes, lack of trust between clients and creators, intellectual property theft, and inefficient dispute resolution. By leveraging the Stacks blockchain and Clarity smart contracts, creators (e.g., artists, writers, designers) can securely accept commissions, protect their IP, and ensure fair payments, while clients get guaranteed delivery and ownership transfer.

## ✨ Features

🔐 User registration for artists and clients with verifiable identities  
📝 Post and bid on commission requests  
💰 Secure escrow for payments using STX or SIP-10 tokens  
⏰ Immutable IP registration with timestamps and hashes  
🚚 Automated delivery verification and payment release  
⚖️ Built-in dispute resolution via DAO voting  
⭐ Reputation system for ratings and reviews  
📊 Governance token for platform upgrades  
🚫 Anti-fraud measures to prevent duplicate claims or scams  

## 🛠 How It Works

This platform uses 8 Clarity smart contracts to handle the end-to-end workflow. Here's a high-level overview:

- **UserRegistry.clar**: Manages user profiles, roles (artist/client), and basic KYC-like verification hashes.  
- **CommissionMarketplace.clar**: Allows clients to post jobs with details (description, budget, deadline) and artists to bid.  
- **Escrow.clar**: Holds funds in escrow upon bid acceptance; supports partial milestones.  
- **IPRegistry.clar**: Registers work hashes, titles, and descriptions for immutable proof of ownership.  
- **DeliveryVerifier.clar**: Handles submission of completed work (via hash or off-chain link) and client approval.  
- **DisputeResolution.clar**: Initiates disputes, integrates with a DAO for arbitration votes.  
- **ReputationSystem.clar**: Tracks ratings, reviews, and reputation scores post-completion.  
- **Governance.clar**: Manages platform rules, fees, and upgrades via token holders.  

**For Clients**  
- Register via UserRegistry and post a job in CommissionMarketplace with details and budget.  
- Review artist bids, select one, and fund the Escrow contract.  
- Upon delivery (submitted to DeliveryVerifier), approve to release payment or dispute via DisputeResolution.  
- Rate the artist in ReputationSystem after completion.  

**For Artists**  
- Register in UserRegistry and browse open commissions in CommissionMarketplace.  
- Submit a bid; if accepted, start work and register your IP draft in IPRegistry for protection.  
- Deliver the final work hash to DeliveryVerifier.  
- Funds auto-release from Escrow upon approval; appeal disputes in DisputeResolution.  
- Build your reputation with positive reviews.  

**For Verifiers/Arbitrators**  
- Use IPRegistry to check ownership proofs.  
- Participate in DisputeResolution votes (if holding governance tokens).  
- Query ReputationSystem for user histories to inform decisions.  

That's it! A trustless system that empowers creators and clients worldwide, reducing intermediaries and ensuring transparency. Deploy on Stacks for Bitcoin-secured reliability.