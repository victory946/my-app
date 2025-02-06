"use server";

import {
  ACHClass,
  CountryCode,
  TransferAuthorizationCreateRequest,
  TransferCreateRequest,
  TransferNetwork,
  TransferType,
} from "plaid";
import axios from "axios";

import { parseStringify } from "../utils";
import { getTransactionsByBankId } from "./transaction.actions";
import { getBanks, getBank } from "./user.actions";

// Setup Axios for Plaid requests using your environment variables.
const PLAID_BASE_URL =
  process.env.PLAID_BASE_URL || "https://sandbox.plaid.com";
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;

const axiosInstance = axios.create({
  baseURL: PLAID_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * getAccounts:
 * Fetches the banks for a user, then calls Plaid's accounts/get endpoint for each bank
 * to get account details along with institution info.
 */
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
        // Call Plaid's accounts/get endpoint using Axios.
        const accountsResponse = await axiosInstance.post("/accounts/get", {
          access_token: bank.accessToken,
          client_id: PLAID_CLIENT_ID,
          secret: PLAID_SECRET,
        });
        if (
          !accountsResponse ||
          !accountsResponse.data.accounts ||
          accountsResponse.data.accounts.length === 0
        ) {
          console.error(
            "Error: No account data from Plaid for bank:",
            bank.$id
          );
          return null;
        }
        const accountData = accountsResponse.data.accounts[0];

        // Get institution info using our helper below.
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

/**
 * getAccount:
 * Fetches a single bank (via its document ID) then uses Plaid to retrieve the account,
 * merges any transfer transactions, gets institution details, and combines all transactions.
 */
export const getAccount = async ({ appwriteItemId }: getAccountProps) => {
  try {
    console.log("Fetching bank with documentId:", appwriteItemId);
    const bank = await getBank({ documentId: appwriteItemId });

    if (!bank) {
      console.error("Error: Bank not found for documentId:", appwriteItemId);
      return null;
    }

    console.log("Fetching account info from Plaid...");
    const accountsResponse = await axiosInstance.post("/accounts/get", {
      access_token: bank.accessToken,
      client_id: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
    });

    if (
      !accountsResponse ||
      !accountsResponse.data.accounts ||
      accountsResponse.data.accounts.length === 0
    ) {
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

/**
 * getInstitution:
 * Fetches institution details from Plaid using the institutions/get_by_id endpoint.
 */
export const getInstitution = async ({
  institutionId,
}: getInstitutionProps) => {
  try {
    console.log("Fetching institution with ID:", institutionId);
    const institutionResponse = await axiosInstance.post(
      "/institutions/get_by_id",
      {
        institution_id: institutionId,
        country_codes: ["US"] as CountryCode[],
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
      }
    );
    return parseStringify(institutionResponse.data.institution);
  } catch (error) {
    console.error("An error occurred while getting the institution:", error);
    return null;
  }
};

/**
 * getTransactions:
 * Uses Plaid's transactions/sync endpoint (via Axios) to fetch transactions.
 * A cursor is used to continue fetching transactions in batches if more are available.
 */
export const getTransactions = async ({
  accessToken,
}: getTransactionsProps) => {
  let hasMore = true;
  let transactions: any[] = [];
  let cursor = ""; // Initial cursor (empty for the first call)

  try {
    console.log("Fetching transactions...");
    while (hasMore) {
      const response = await axiosInstance.post("/transactions/sync", {
        access_token: accessToken,
        cursor, // Send the current cursor (empty string initially)
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
      });

      console.log("Plaid transactionsSync response:", response.data);

      if (!response?.data?.added || response.data.added.length === 0) break;
      transactions.push(
        ...response.data.added.map((transaction: any) => ({
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
      // Update the cursor and hasMore flag for the next iteration.
      cursor = response.data.next_cursor || "";
      hasMore = response.data.has_more;
    }
    return parseStringify(transactions);
  } catch (error) {
    console.error("An error occurred while getting transactions:", error);
    return [];
  }
};
