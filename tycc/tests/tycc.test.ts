import { Cl } from "@stacks/transactions";
import { describe, it, expect } from "vitest";

const accounts = simnet.getAccounts();
const alice = accounts.get("wallet_1")!;
const bob = accounts.get("wallet_2")!;
const charlie = accounts.get("wallet_3")!;
const dave = accounts.get("wallet_4")!; // Assuming wallet_4 exists in simnet accounts

describe("tycc Contract Tests", () => {
  it("allows a user to register with a unique username", () => {
    const { result: registerResult } = simnet.callPublicFn(
      "tycc",
      "register",
      [Cl.stringAscii("AliceUser")],
      alice
    );

    expect(registerResult).toBeOk(Cl.bool(true));

    const { result: isRegisteredResult } = simnet.callReadOnlyFn(
      "tycc",
      "is-registered",
      [Cl.principal(alice)],
      alice
    );

    expect(isRegisteredResult).toEqual(Cl.bool(true));
  });

  it("prevents duplicate registration", () => {
    simnet.callPublicFn("tycc", "register", [Cl.stringAscii("AliceUser")], alice);

    const { result: secondAttempt } = simnet.callPublicFn(
      "tycc",
      "register",
      [Cl.stringAscii("AliceUser")],
      alice
    );

    expect(secondAttempt).toBeErr(Cl.uint(100)); // ERR_ALREADY_REGISTERED
  });

  it("rejects taken usernames", () => {
    simnet.callPublicFn("tycc", "register", [Cl.stringAscii("AliceUser")], alice);

    const { result: takenUsername } = simnet.callPublicFn(
      "tycc",
      "register",
      [Cl.stringAscii("AliceUser")],
      bob
    );

    expect(takenUsername).toBeErr(Cl.uint(101)); // ERR_USERNAME_TAKEN
  });

  it("allows a registered user to create a game and updates user stats", () => {
    simnet.callPublicFn("tycc", "register", [Cl.stringAscii("AliceUser")], alice);

    const { result: createResult } = simnet.callPublicFn(
      "tycc",
      "create-game",
      [
        Cl.uint(1), // game-type
        Cl.uint(1), // player-symbol
        Cl.uint(2), // number-of-players
        Cl.stringAscii("GAME123"),
        Cl.uint(1000), // starting balance
        Cl.uint(500) // bet amount
      ],
      alice
    );

    expect(createResult).toBeOk(Cl.uint(0)); // first game ID is 0

    // Check user stats updated
    const { result: userResult } = simnet.callReadOnlyFn("tycc", "get-user", [Cl.principal(alice)], alice);
    expect(userResult.type).toBe('some');
    const userTuple = userResult.value.value;
    expect(userTuple["games-played"]).toEqual(Cl.uint(1));
    expect(userTuple["total-staked"]).toEqual(Cl.uint(500));
  });

  it("allows another registered user to join a game and updates user stats", () => {
    // Register both players
    simnet.callPublicFn("tycc", "register", [Cl.stringAscii("AliceUser")], alice);
    simnet.callPublicFn("tycc", "register", [Cl.stringAscii("BobUser")], bob);

    // Create game by Alice
    const { result: gameResult } = simnet.callPublicFn(
      "tycc",
      "create-game",
      [
        Cl.uint(1),
        Cl.uint(1),
        Cl.uint(2),
        Cl.stringAscii("GAME123"),
        Cl.uint(1000),
        Cl.uint(500)
      ],
      alice
    );

    expect(gameResult).toBeOk(Cl.uint(0));

    // Check Alice stats before join
    let { result: aliceUserBefore } = simnet.callReadOnlyFn("tycc", "get-user", [Cl.principal(alice)], alice);
    const aliceBeforeTuple = aliceUserBefore.value.value;
    expect(aliceBeforeTuple["games-played"]).toEqual(Cl.uint(1));
    expect(aliceBeforeTuple["total-staked"]).toEqual(Cl.uint(500));

    // Bob joins game 0
    const { result: joinResult } = simnet.callPublicFn(
      "tycc",
      "join-game",
      [Cl.uint(0), Cl.uint(2)], // game-id, player-symbol
      bob
    );

    expect(joinResult).toBeOk(Cl.uint(2)); // Bob joins as 2nd player (order = 2)

    // Check Bob stats updated
    const { result: bobUserAfter } = simnet.callReadOnlyFn("tycc", "get-user", [Cl.principal(bob)], bob);
    const bobAfterTuple = bobUserAfter.value.value;
    expect(bobAfterTuple["games-played"]).toEqual(Cl.uint(1));
    expect(bobAfterTuple["total-staked"]).toEqual(Cl.uint(500));

    // Game should now be ongoing
    const { result: gameAfter } = simnet.callReadOnlyFn("tycc", "get-game", [Cl.uint(0)], alice);
    const gameTuple = gameAfter.value.value;
    expect(gameTuple["status"]).toEqual(Cl.uint(2)); // STATUS_ONGOING
  });

  it("allows a player to update position and balance during ongoing game", () => {
    // Register and setup 2-player game
    simnet.callPublicFn("tycc", "register", [Cl.stringAscii("AliceUser")], alice);
    simnet.callPublicFn("tycc", "register", [Cl.stringAscii("BobUser")], bob);

    simnet.callPublicFn(
      "tycc",
      "create-game",
      [
        Cl.uint(1),
        Cl.uint(1),
        Cl.uint(2),
        Cl.stringAscii("GAMEPOS"),
        Cl.uint(1000),
        Cl.uint(500)
      ],
      alice
    );

    simnet.callPublicFn("tycc", "join-game", [Cl.uint(0), Cl.uint(2)], bob);

    // Alice updates position (only caller can update own)
    const { result: updateResult } = simnet.callPublicFn(
      "tycc",
      "update-player-position",
      [
        Cl.uint(0), // game-id
        Cl.principal(alice), // player (self)
        Cl.uint(10), // new-position
        Cl.uint(900), // new-balance
        Cl.none() // no property
      ],
      alice
    );

    expect(updateResult).toBeOk(Cl.bool(true));

    // Verify update
    const { result: playerResult } = simnet.callReadOnlyFn(
      "tycc",
      "get-game-player",
      [Cl.uint(0), Cl.principal(alice)],
      alice
    );
    expect(playerResult.type).toBe('some');
    const playerTuple = playerResult.value.value;
    expect(playerTuple["position"]).toEqual(Cl.uint(10));
    expect(playerTuple["balance"]).toEqual(Cl.uint(900));
  });

  it("allows updating position with property ownership", () => {
    // Setup as above
    simnet.callPublicFn("tycc", "register", [Cl.stringAscii("AliceUser")], alice);
    simnet.callPublicFn("tycc", "register", [Cl.stringAscii("BobUser")], bob);

    simnet.callPublicFn(
      "tycc",
      "create-game",
      [
        Cl.uint(1),
        Cl.uint(1),
        Cl.uint(2),
        Cl.stringAscii("GAMEPROP"),
        Cl.uint(1000),
        Cl.uint(500)
      ],
      alice
    );

    simnet.callPublicFn("tycc", "join-game", [Cl.uint(0), Cl.uint(2)], bob);

    // Alice updates and claims property 5
    const { result: updateResult } = simnet.callPublicFn(
      "tycc",
      "update-player-position",
      [
        Cl.uint(0),
        Cl.principal(alice),
        Cl.uint(5),
        Cl.uint(800),
        Cl.some(Cl.uint(5)) // property-id
      ],
      alice
    );

    expect(updateResult).toBeOk(Cl.bool(true));

    // Verify property ownership
    const { result: propResult } = simnet.callReadOnlyFn(
      "tycc",
      "get-property",
      [Cl.uint(0), Cl.uint(5)],
      alice
    );
    expect(propResult.type).toBe('some');
    const propTuple = propResult.value.value;
    expect(propTuple["owner"]).toEqual(Cl.principal(alice));
    expect(propTuple["base-price"]).toEqual(Cl.uint(100));
    expect(propTuple["current-rent"]).toEqual(Cl.uint(10));
  });

  it("prevents non-player from updating position", () => {
    simnet.callPublicFn("tycc", "register", [Cl.stringAscii("AliceUser")], alice);
    simnet.callPublicFn("tycc", "register", [Cl.stringAscii("BobUser")], bob);

    simnet.callPublicFn(
      "tycc",
      "create-game",
      [
        Cl.uint(1),
        Cl.uint(1),
        Cl.uint(2),
        Cl.stringAscii("GAMEAUTH"),
        Cl.uint(1000),
        Cl.uint(500)
      ],
      alice
    );

    simnet.callPublicFn("tycc", "join-game", [Cl.uint(0), Cl.uint(2)], bob);

    // Bob tries to update Alice's position
    const { result: unauthorizedUpdate } = simnet.callPublicFn(
      "tycc",
      "update-player-position",
      [
        Cl.uint(0),
        Cl.principal(alice), // Alice's position
        Cl.uint(10),
        Cl.uint(900),
        Cl.none()
      ],
      bob // Called by Bob
    );

    expect(unauthorizedUpdate).toBeErr(Cl.uint(208)); // ERR_NOT_PLAYER
  });

  it("allows finalizing a game with reward and updates winner stats", () => {
    // Setup 2-player game
    simnet.callPublicFn("tycc", "register", [Cl.stringAscii("AliceUser")], alice);
    simnet.callPublicFn("tycc", "register", [Cl.stringAscii("BobUser")], bob);

    simnet.callPublicFn(
      "tycc",
      "create-game",
      [
        Cl.uint(1),
        Cl.uint(1),
        Cl.uint(2),
        Cl.stringAscii("GAMEWIN"),
        Cl.uint(1000),
        Cl.uint(500)
      ],
      alice
    );

    simnet.callPublicFn("tycc", "join-game", [Cl.uint(0), Cl.uint(2)], bob);

    // Check initial staked (1000 total)
    let { result: gameBefore } = simnet.callReadOnlyFn("tycc", "get-game", [Cl.uint(0)], alice);
    const gameBeforeTuple = gameBefore.value.value;
    expect(gameBeforeTuple["total-staked"]).toEqual(Cl.uint(1000));

    // Check Alice stats before
    let { result: aliceUserBefore } = simnet.callReadOnlyFn("tycc", "get-user", [Cl.principal(alice)], alice);
    const aliceBeforeTuple = aliceUserBefore.value.value;
    expect(aliceBeforeTuple["games-won"]).toEqual(Cl.uint(0));
    expect(aliceBeforeTuple["total-earned"]).toEqual(Cl.uint(0));

    // Finalize with Alice as winner, enough turns for bonus
    const { result: finalizeResult } = simnet.callPublicFn(
      "tycc",
      "finalize-game",
      [Cl.uint(0), Cl.principal(alice), Cl.uint(15)], // game-id, winner, total-turns (> MIN=10)
      alice
    );

    expect(finalizeResult).toBeOk(Cl.uint(1000)); // reward amount

    // Game ended
    const { result: gameAfter } = simnet.callReadOnlyFn("tycc", "get-game", [Cl.uint(0)], alice);
    const gameTuple = gameAfter.value.value;
    expect(gameTuple["status"]).toEqual(Cl.uint(3)); // STATUS_ENDED
    expect(gameTuple["winner"]).toEqual(Cl.some(Cl.principal(alice)));

    // Alice stats updated
    const { result: aliceUserAfter } = simnet.callReadOnlyFn("tycc", "get-user", [Cl.principal(alice)], alice);
    const aliceAfterTuple = aliceUserAfter.value.value;
    expect(aliceAfterTuple["games-won"]).toEqual(Cl.uint(1));
    expect(aliceAfterTuple["total-earned"]).toEqual(Cl.uint(1000)); // earned the pot
  });

  it("finalizes game without bonus if turns < MIN", () => {
    // Setup similar
    simnet.callPublicFn("tycc", "register", [Cl.stringAscii("CharlieUser")], charlie);
    simnet.callPublicFn("tycc", "register", [Cl.stringAscii("DaveUser")], dave);

    simnet.callPublicFn(
      "tycc",
      "create-game",
      [
        Cl.uint(1),
        Cl.uint(1),
        Cl.uint(2),
        Cl.stringAscii("NOBONUS"),
        Cl.uint(1000),
        Cl.uint(500)
      ],
      charlie
    );

    simnet.callPublicFn("tycc", "join-game", [Cl.uint(0), Cl.uint(2)], dave);

    // Finalize with low turns
    const { result: finalizeResult } = simnet.callPublicFn(
      "tycc",
      "finalize-game",
      [Cl.uint(0), Cl.principal(charlie), Cl.uint(5)], // < MIN=10
      charlie
    );

    expect(finalizeResult).toBeOk(Cl.uint(1000)); // still full pot, no extra bonus in payout

    // Stats updated similarly
    const { result: charlieUserAfter } = simnet.callReadOnlyFn("tycc", "get-user", [Cl.principal(charlie)], charlie);
    const charlieAfterTuple = charlieUserAfter.value.value;
    expect(charlieAfterTuple["games-won"]).toEqual(Cl.uint(1));
    expect(charlieAfterTuple["total-earned"]).toEqual(Cl.uint(1000));
  });

  it("allows a player to be removed and ends game if one remains", () => {
    // Register players
    simnet.callPublicFn("tycc", "register", [Cl.stringAscii("AliceUser")], alice);
    simnet.callPublicFn("tycc", "register", [Cl.stringAscii("BobUser")], bob);

    // Create game by Alice
    const { result: createRes } = simnet.callPublicFn(
      "tycc",
      "create-game",
      [
        Cl.uint(1),
        Cl.uint(1),
        Cl.uint(2),
        Cl.stringAscii("GAMEEND"),
        Cl.uint(1000),
        Cl.uint(500)
      ],
      alice
    );
    expect(createRes).toBeOk(Cl.uint(0));

    // Bob joins
    const { result: joinRes } = simnet.callPublicFn("tycc", "join-game", [Cl.uint(0), Cl.uint(2)], bob);
    expect(joinRes).toBeOk(Cl.uint(2));

    // Remove Bob (final candidate is Alice) - alice calls remove-player
    const { result: removeResult } = simnet.callPublicFn(
      "tycc",
      "remove-player",
      [
        Cl.uint(0), // game-id
        Cl.principal(bob), // player to remove
        Cl.some(Cl.principal(alice)), // final candidate
        Cl.uint(15) // total turns
      ],
      alice
    );

    expect(removeResult).toBeOk(Cl.bool(true));

    // Read the game back
    const { result: endedGame } = simnet.callReadOnlyFn("tycc", "get-game", [Cl.uint(0)], alice);

    // Ensure it's some (not none)
    expect(endedGame.type).toBe('some');
    expect(endedGame.value).not.toBeNull();
    const gameTuple = endedGame.value;  // ClarityTuple wrapper
    expect(gameTuple).toBeDefined();
    expect(gameTuple.type).toBe('tuple');  // Optional: explicit type check

    const endedTuple = gameTuple.value;  // The actual fields: { status: ClarityValue, winner: ClarityValue, ... }
    expect(endedTuple).toBeDefined();

    // status should now be u3 (ended)
    expect(endedTuple["status"]).toEqual(Cl.uint(3)); // u3 = ended

    // and winner should be some(alice)
    expect(endedTuple["winner"]).toEqual(Cl.some(Cl.principal(alice)));
  });
});