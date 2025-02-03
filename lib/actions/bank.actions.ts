"use server";

import {
  ACHClass,
  CountryCode,
  TransferAuthorizationCreateRequest,
  TransferCreateRequest,
  TransferNetwork,
  TransferType,
} from "plaid";

import { plaidClient } from "../plaid";
import { parseStringify } from "../utils";

import { getTransactionsByBankId } from "./transaction.actions";
import { getBanks, getBank } from "./user.actions";

export const getAccounts = async ({ userId }: getAccountsProps) => {
  try {
    console.log("Fetching banks for user:", userId);
    const banks = await getBanks({ userId });

    if (!banks || banks.length === 0) {
      console.error("Error: No banks found for user:", userId);
      return null;
    }

    const accounts = await Promise.all(
      banks.map(async (bank: Bank) => {
        const accountsResponse = await plaidClient.accountsGet({
          access_token: bank.accessToken,
        });
        if (!accountsResponse || !accountsResponse.data.accounts?.length) {
          console.error(
            "Error: No account data from Plaid for bank:",
            bank.$id
          );
          return null;
        }
        const accountData = accountsResponse.data.accounts[0];
        const institution = await getInstitution({
          institutionId: accountsResponse.data.item.institution_id!,
        });
        return {
          id: accountData.account_id,
          availableBalance: accountData.balances.available!,
          currentBalance: accountData.balances.current!,
          institutionId: institution.institution_id,
          name: accountData.name,
          officialName: accountData.official_name,
          mask: accountData.mask!,
          type: accountData.type,
          subtype: accountData.subtype!,
          appwriteItemId: bank.$id,
          shareableId: bank.shareableId,
        };
      })
    );

    const totalBanks = accounts.length;
    const totalCurrentBalance = accounts.reduce(
      (total, account) => total + (account?.currentBalance || 0),
      0
    );

    return parseStringify({ data: accounts, totalBanks, totalCurrentBalance });
  } catch (error) {
    console.error("An error occurred while getting the accounts:", error);
    return null;
  }
};

export const getAccount = async ({ appwriteItemId }: getAccountProps) => {
  try {
    console.log("Fetching bank with documentId:", appwriteItemId);
    const bank = await getBank({ documentId: appwriteItemId });

    if (!bank) {
      console.error("Error: Bank not found for documentId:", appwriteItemId);
      return null;
    }

    console.log("Fetching account info from Plaid...");
    const accountsResponse = await plaidClient.accountsGet({
      access_token: bank.accessToken,
    });

    if (!accountsResponse || !accountsResponse.data.accounts?.length) {
      console.error("Error: No account data found from Plaid.");
      return null;
    }

    const accountData = accountsResponse.data.accounts[0];

    console.log("Fetching transactions for bank:", bank.$id);
    const transferTransactionsData = await getTransactionsByBankId({
      bankId: bank.$id,
    });

    const transferTransactions =
      transferTransactionsData?.documents?.map((transferData: Transaction) => ({
        id: transferData.$id,
        name: transferData.name!,
        amount: transferData.amount!,
        date: transferData.$createdAt,
        paymentChannel: transferData.channel,
        category: transferData.category,
        type: transferData.senderBankId === bank.$id ? "debit" : "credit",
      })) || [];

    console.log("Fetching institution info from Plaid...");
    const institution = await getInstitution({
      institutionId: accountsResponse.data.item.institution_id!,
    });

    console.log("Fetching transactions for account...");
    const transactions = await getTransactions({
      accessToken: bank.accessToken,
    });

    const account = {
      id: accountData.account_id,
      availableBalance: accountData.balances.available!,
      currentBalance: accountData.balances.current!,
      institutionId: institution.institution_id,
      name: accountData.name,
      officialName: accountData.official_name,
      mask: accountData.mask!,
      type: accountData.type,
      subtype: accountData.subtype!,
      appwriteItemId: bank.$id,
    };

    const allTransactions = [...transactions, ...transferTransactions].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    console.log("Successfully fetched account data.");
    return parseStringify({ data: account, transactions: allTransactions });
  } catch (error) {
    console.error("An error occurred while getting the account:", error);
    return null;
  }
};

export const getInstitution = async ({
  institutionId,
}: getInstitutionProps) => {
  try {
    console.log("Fetching institution with ID:", institutionId);
    const institutionResponse = await plaidClient.institutionsGetById({
      institution_id: institutionId,
      country_codes: ["US"] as CountryCode[],
    });
    return parseStringify(institutionResponse.data.institution);
  } catch (error) {
    console.error("An error occurred while getting the institution:", error);
    return null;
  }
};

export const getTransactions = async ({
  accessToken,
}: getTransactionsProps) => {
  let hasMore = true;
  let transactions: any[] = [];

  try {
    console.log("Fetching transactions...");
    while (hasMore) {
      const response = await plaidClient.transactionsSync({
        access_token: accessToken,
      });
      if (!response?.data?.added || response.data.added.length === 0) break;
      transactions.push(
        ...response.data.added.map((transaction) => ({
          id: transaction.transaction_id,
          name: transaction.name,
          paymentChannel: transaction.payment_channel,
          type: transaction.payment_channel,
          accountId: transaction.account_id,
          amount: transaction.amount,
          pending: transaction.pending,
          category: transaction.category ? transaction.category[0] : "",
          date: transaction.date,
          image: transaction.logo_url,
        }))
      );
      hasMore = response.data.has_more;
    }
    return parseStringify(transactions);
  } catch (error) {
    console.error("An error occurred while getting transactions:", error);
    return [];
  }
};
