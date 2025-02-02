"use server";

import { Client } from "dwolla-v2";

// Ensure environment variables exist
if (
  !process.env.DWOLLA_KEY ||
  !process.env.DWOLLA_SECRET ||
  !process.env.DWOLLA_ENV
) {
  throw new Error("Missing Dwolla environment variables.");
}

// Get the correct Dwolla environment
const getEnvironment = (): "production" | "sandbox" => {
  switch (process.env.DWOLLA_ENV) {
    case "sandbox":
      return "sandbox";
    case "production":
      return "production";
    default:
      throw new Error(
        "Dwolla environment should be either `sandbox` or `production`."
      );
  }
};

// Initialize Dwolla Client
const dwollaClient = new Client({
  environment: getEnvironment(),
  key: process.env.DWOLLA_KEY!,
  secret: process.env.DWOLLA_SECRET!,
});

// Type Definitions
interface CreateFundingSourceOptions {
  customerId: string;
  fundingSourceName: string;
  plaidToken: string;
}

interface NewDwollaCustomerParams {
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string; // Ensure it's in YYYY-MM-DD format
  type: "personal" | "business";
}

interface TransferParams {
  sourceFundingSourceUrl: string;
  destinationFundingSourceUrl: string;
  amount: string;
}

interface AddFundingSourceParams {
  dwollaCustomerId: string;
  processorToken: string;
  bankName: string;
}

// 🏦 Create a Dwolla Funding Source using a Plaid Processor Token
export const createFundingSource = async (
  options: CreateFundingSourceOptions
) => {
  try {
    const response = await dwollaClient.post(
      `customers/${options.customerId}/funding-sources`,
      {
        name: options.fundingSourceName,
        plaidToken: options.plaidToken,
      }
    );
    return response.headers.get("location");
  } catch (err: any) {
    console.error(
      "❌ Creating a Funding Source Failed:",
      err.response?.body || err
    );
    throw new Error("Failed to create funding source.");
  }
};

// 🔄 Create On-Demand Authorization for Dwolla Transfers
export const createOnDemandAuthorization = async () => {
  try {
    const response = await dwollaClient.post("on-demand-authorizations");
    return response.body._links;
  } catch (err: any) {
    console.error(
      "❌ Creating an On-Demand Authorization Failed:",
      err.response?.body || err
    );
    throw new Error("Failed to create on-demand authorization.");
  }
};

// 👤 Create a Dwolla Customer
export const createDwollaCustomer = async (
  newCustomer: NewDwollaCustomerParams
) => {
  try {
    // Ensure dateOfBirth is formatted correctly (YYYY-MM-DD)
    const formattedDOB = new Date(newCustomer.dateOfBirth)
      .toISOString()
      .split("T")[0];

    const customerData = {
      ...newCustomer,
      dateOfBirth: formattedDOB, // Properly formatted
    };

    const response = await dwollaClient.post("customers", customerData);
    return response.headers.get("location");
  } catch (err: any) {
    console.error(
      "❌ Creating a Dwolla Customer Failed:",
      err.response?.body || err
    );
    throw new Error("Error creating Dwolla customer.");
  }
};

// 💸 Create a Dwolla Transfer
export const createTransfer = async ({
  sourceFundingSourceUrl,
  destinationFundingSourceUrl,
  amount,
}: TransferParams) => {
  try {
    const requestBody = {
      _links: {
        source: { href: sourceFundingSourceUrl },
        destination: { href: destinationFundingSourceUrl },
      },
      amount: {
        currency: "USD",
        value: amount,
      },
    };

    const response = await dwollaClient.post("transfers", requestBody);
    return response.headers.get("location");
  } catch (err: any) {
    console.error("❌ Transfer Failed:", err.response?.body || err);
    throw new Error("Transfer fund failed.");
  }
};

// 🏦 Add a Funding Source to a Dwolla Customer
export const addFundingSource = async ({
  dwollaCustomerId,
  processorToken,
  bankName,
}: AddFundingSourceParams) => {
  try {
    // Get Dwolla authorization links (not needed for funding source request)
    await createOnDemandAuthorization();

    // Create funding source for the Dwolla customer
    return await createFundingSource({
      customerId: dwollaCustomerId,
      fundingSourceName: bankName,
      plaidToken: processorToken,
    });
  } catch (err: any) {
    console.error(
      "❌ Adding Funding Source Failed:",
      err.response?.body || err
    );
    throw new Error("Failed to add funding source.");
  }
};
