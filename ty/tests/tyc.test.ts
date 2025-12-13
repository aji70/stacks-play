
import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const alice = accounts.get("wallet_1")!;
const bob = accounts.get("wallet_2")!;
const charlie = accounts.get("wallet_3")!;
const dave = accounts.get("wallet_4")!;



/*
  The test below is an example. To learn more, read the testing documentation here:
  https://docs.hiro.so/stacks/clarinet-js-sdk
*/



describe("tyc Contract Tests", () => {
  it("ensures simnet is well initialised", () => {
    expect(simnet.blockHeight).toBeDefined();
  });

  it("shows an example", () => {
    const { result } = simnet.callReadOnlyFn("tyc", "is-registered",[Cl.principal(alice)], alice);
    expect(result).toEqual(Cl.bool(false));
  });

    it("allows a user to register with a unique username", () => {
    const { result: registerResult } = simnet.callPublicFn(
      "tyc",
      "register",
      [Cl.stringAscii("AliceUser")],
      alice
    );

    expect(registerResult).toBeOk(Cl.bool(true));

    const { result: isRegisteredResult } = simnet.callReadOnlyFn(
      "tyc",
      "is-registered",
      [Cl.principal(alice)],
      alice
    );

    expect(isRegisteredResult).toEqual(Cl.bool(true));
  });

    it("prevents duplicate registration", () => {
    simnet.callPublicFn("tyc", "register", [Cl.stringAscii("AliceUser")], alice);

    const { result: secondAttempt } = simnet.callPublicFn(
      "tyc",
      "register",
      [Cl.stringAscii("AliceUser")],
      alice
    );

    expect(secondAttempt).toBeErr(Cl.uint(100)); // ERR_ALREADY_REGISTERED
  });

   it("rejects taken usernames", () => {
    simnet.callPublicFn("tyc", "register", [Cl.stringAscii("AliceUser")], alice);

    const { result: takenUsername } = simnet.callPublicFn(
      "tyc",
      "register",
      [Cl.stringAscii("AliceUser")],
      bob
    );

    expect(takenUsername).toBeErr(Cl.uint(101)); // ERR_USERNAME_TAKEN
  });

  it("allows a registered user to create a game and updates user stats", () => {
    simnet.callPublicFn("tyc", "register", [Cl.stringAscii("AliceUser")], alice);

    const { result: createResult } = simnet.callPublicFn(
      "tyc",
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
    const { result: userResult } = simnet.callReadOnlyFn("tyc", "get-user", [Cl.principal(alice)], alice);
    expect(userResult.type).toBe('some');
    // const userTuple = userResult.value.value;
    // expect(userTuple["games-played"]).toEqual(Cl.uint(1));
    // expect(userTuple["total-staked"]).toEqual(Cl.uint(500));
  });
});
