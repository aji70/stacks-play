
import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
// const alice = accounts.get("wallet_1")!;
// const bob = accounts.get("wallet_2")!;
// const charlie = accounts.get("wallet_3")!;
// const dave = accounts.get("wallet_4")!;
// const accounts = simnet.getAccounts();
const address1 = accounts.get("wallet_1")!;

/*
  The test below is an example. To learn more, read the testing documentation here:
  https://docs.hiro.so/stacks/clarinet-js-sdk
*/



describe("tycc Contract Tests", () => {
  it("ensures simnet is well initialised", () => {
    expect(simnet.blockHeight).toBeDefined();
  });

  it("shows an example", () => {
    const { result } = simnet.callReadOnlyFn("tyc", "is-registered",[Cl.principal(address1)], address1);
    expect(result).toEqual(Cl.bool(false));
  });
});
