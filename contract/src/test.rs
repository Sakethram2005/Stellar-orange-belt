#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn setup() -> (Env, NFTAuctionHouseClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(NFTAuctionHouse, ());
    let client = NFTAuctionHouseClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.init(&admin);
    (env, client, admin)
}

#[test]
fn test_create_auction() {
    let (env, client, _admin) = setup();
    let seller = Address::generate(&env);

    let id = client.create_auction(
        &seller,
        &String::from_str(&env, "Cool NFT #1"),
        &String::from_str(&env, "A rare digital artwork"),
    );

    assert_eq!(id, 1);

    let auction = client.view_auction(&1);
    assert_eq!(auction.id, 1);
    assert_eq!(auction.is_active, true);
    assert_eq!(auction.highest_bid, 0);
    assert_eq!(auction.seller, seller);
}

#[test]
fn test_place_bid() {
    let (env, client, _admin) = setup();
    let seller = Address::generate(&env);
    let bidder = Address::generate(&env);

    client.create_auction(
        &seller,
        &String::from_str(&env, "NFT #2"),
        &String::from_str(&env, "Another NFT"),
    );

    client.place_bid(&1, &bidder, &500);

    let auction = client.view_auction(&1);
    assert_eq!(auction.highest_bid, 500);
    assert_eq!(auction.highest_bidder, Some(bidder));
}

#[test]
fn test_bid_must_be_higher() {
    let (env, client, _admin) = setup();
    let seller = Address::generate(&env);
    let bidder1 = Address::generate(&env);
    let bidder2 = Address::generate(&env);

    client.create_auction(
        &seller,
        &String::from_str(&env, "NFT #3"),
        &String::from_str(&env, "Test NFT"),
    );

    client.place_bid(&1, &bidder1, &1000);

    // Lower bid should fail — use should_panic
    let result = client.try_place_bid(&1, &bidder2, &500);
    assert!(result.is_err());
}

#[test]
fn test_end_auction() {
    let (env, client, _admin) = setup();
    let seller = Address::generate(&env);
    let bidder = Address::generate(&env);

    client.create_auction(
        &seller,
        &String::from_str(&env, "NFT #4"),
        &String::from_str(&env, "Ending NFT"),
    );

    client.place_bid(&1, &bidder, &750);
    client.end_auction(&seller, &1);

    let auction = client.view_auction(&1);
    assert_eq!(auction.is_active, false);
    assert_eq!(auction.highest_bid, 750);
}

#[test]
fn test_cannot_bid_on_ended_auction() {
    let (env, client, _admin) = setup();
    let seller = Address::generate(&env);
    let bidder = Address::generate(&env);

    client.create_auction(
        &seller,
        &String::from_str(&env, "NFT #5"),
        &String::from_str(&env, "Closed NFT"),
    );

    client.end_auction(&seller, &1);

    // Bidding on ended auction should fail
    let result = client.try_place_bid(&1, &bidder, &1000);
    assert!(result.is_err());
}

#[test]
fn test_get_multiple_auctions() {
    let (env, client, _admin) = setup();
    let seller = Address::generate(&env);

    client.create_auction(
        &seller,
        &String::from_str(&env, "NFT A"),
        &String::from_str(&env, "First"),
    );
    client.create_auction(
        &seller,
        &String::from_str(&env, "NFT B"),
        &String::from_str(&env, "Second"),
    );
    client.create_auction(
        &seller,
        &String::from_str(&env, "NFT C"),
        &String::from_str(&env, "Third"),
    );

    assert_eq!(client.get_count(), 3);

    let all = client.get_auctions();
    assert_eq!(all.len(), 3);
}