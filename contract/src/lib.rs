#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Vec,
};

#[cfg(test)]
mod test;

#[contracttype]
#[derive(Clone)]
pub struct Auction {
    pub id: u64,
    pub title: String,
    pub description: String,
    pub seller: Address,
    pub highest_bid: u64,
    pub highest_bidder: Option<Address>,
    pub is_active: bool,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct BidRecord {
    pub bidder: Address,
    pub amount: u64,
    pub timestamp: u64,
}

#[contracttype]
pub enum DataKey {
    Auction(u64),
    Bids(u64),
    AuctionCount,
    Admin,
}

#[contract]
pub struct NFTAuctionHouse;

#[contractimpl]
impl NFTAuctionHouse {
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::AuctionCount, &0u64);
    }

    pub fn create_auction(env: Env, seller: Address, title: String, description: String) -> u64 {
        seller.require_auth();

        let mut count: u64 = env.storage().instance().get(&DataKey::AuctionCount).unwrap_or(0);
        count += 1;

        let now = env.ledger().timestamp();

        let auction = Auction {
            id: count,
            title: title.clone(),
            description: description.clone(),
            seller: seller.clone(),
            highest_bid: 0,
            highest_bidder: None,
            is_active: true,
            created_at: now,
        };

        env.storage().instance().set(&DataKey::Auction(count), &auction);
        env.storage().instance().set(&DataKey::AuctionCount, &count);

        env.events().publish(
            (symbol_short!("auction"), symbol_short!("created")),
            (count, seller, title),
        );

        count
    }

    pub fn place_bid(env: Env, auction_id: u64, bidder: Address, amount: u64) {
        bidder.require_auth();

        let key = DataKey::Auction(auction_id);
        let mut auction: Auction = env
            .storage()
            .instance()
            .get(&key)
            .expect("Auction not found");

        if !auction.is_active {
            panic!("Auction is not active");
        }

        if amount <= auction.highest_bid {
            panic!("Bid must be higher than current highest bid");
        }

        let now = env.ledger().timestamp();

        let bid_key = DataKey::Bids(auction_id);
        let mut bids: Vec<BidRecord> = env
            .storage()
            .instance()
            .get(&bid_key)
            .unwrap_or(Vec::new(&env));

        bids.push_back(BidRecord {
            bidder: bidder.clone(),
            amount,
            timestamp: now,
        });
        env.storage().instance().set(&bid_key, &bids);

        auction.highest_bid = amount;
        auction.highest_bidder = Some(bidder.clone());
        env.storage().instance().set(&key, &auction);

        env.events().publish(
            (symbol_short!("auction"), symbol_short!("bid")),
            (auction_id, bidder, amount),
        );
    }

    pub fn end_auction(env: Env, caller: Address, auction_id: u64) {
        caller.require_auth();

        let key = DataKey::Auction(auction_id);
        let mut auction: Auction = env
            .storage()
            .instance()
            .get(&key)
            .expect("Auction not found");

        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");

        if caller != auction.seller && caller != admin {
            panic!("Only seller or admin can end auction");
        }

        if !auction.is_active {
            panic!("Auction already ended");
        }

        auction.is_active = false;
        env.storage().instance().set(&key, &auction);

        env.events().publish(
            (symbol_short!("auction"), symbol_short!("ended")),
            (auction_id, auction.highest_bidder.clone(), auction.highest_bid),
        );
    }

    pub fn view_auction(env: Env, auction_id: u64) -> Auction {
        env.storage()
            .instance()
            .get(&DataKey::Auction(auction_id))
            .expect("Auction not found")
    }

    pub fn get_auctions(env: Env) -> Vec<Auction> {
        let count: u64 = env.storage().instance().get(&DataKey::AuctionCount).unwrap_or(0);

        let mut auctions = Vec::new(&env);
        for i in 1..=count {
            if let Some(a) = env.storage().instance().get(&DataKey::Auction(i)) {
                auctions.push_back(a);
            }
        }
        auctions
    }

    pub fn get_bids(env: Env, auction_id: u64) -> Vec<BidRecord> {
        env.storage()
            .instance()
            .get(&DataKey::Bids(auction_id))
            .unwrap_or(Vec::new(&env))
    }

    pub fn get_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::AuctionCount)
            .unwrap_or(0)
    }
}