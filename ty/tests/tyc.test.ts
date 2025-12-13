
import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const alice = accounts.get("wallet_1")!;
// const bob = accounts.get("wallet_2")!;
// const charlie = accounts.get("wallet_3")!;
// const dave = accounts.get("wallet_4")!;
// const accounts = simnet.getAccounts();


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
});
