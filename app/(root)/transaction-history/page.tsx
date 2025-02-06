import HeaderBox from "@/components/HeaderBox";
import { Pagination } from "@/components/Pagination";
import TransactionsTable from "@/components/TransactionsTable";
import { getAccount, getAccounts } from "@/lib/actions/bank.actions";
import { getLoggedInUser } from "@/lib/actions/user.actions";
import { formatAmount } from "@/lib/utils";
import React from "react";

const TransactionHistory = async ({
  searchParams,
}: {
  searchParams: { id?: string; page?: string };
}) => {
  try {
    const currentPage = Number(searchParams.page) || 1;

    // Fetch logged-in user
    const loggedIn = await getLoggedInUser().catch(() => null);
    if (!loggedIn) {
      return (
        <div className="text-center text-red-500">
          Error: User not logged in or session expired.
        </div>
      );
    }

    // Fetch accounts
    const accounts = await getAccounts({ userId: loggedIn.$id }).catch(
      () => null
    );
    if (!accounts || !accounts.data || accounts.data.length === 0) {
      return (
        <div className="text-center text-red-500">
          Error: No accounts found.
        </div>
      );
    }

    // Determine the correct account ID
    const accountsData = accounts.data;
    const appwriteItemId = searchParams.id || accountsData[0]?.appwriteItemId;

    if (!appwriteItemId) {
      return (
        <div className="text-center text-red-500">
          Error: No valid account ID found.
        </div>
      );
    }

    // Fetch account details
    const account = await getAccount({ appwriteItemId }).catch(() => null);
    if (!account) {
      return (
        <div className="text-center text-red-500">
          Error: Failed to fetch account details.
        </div>
      );
    }

    // Pagination logic
    const rowsPerPage = 10;
    const totalPages = Math.ceil(
      (account?.transactions?.length || 0) / rowsPerPage
    );
    const indexOfLastTransaction = currentPage * rowsPerPage;
    const indexOfFirstTransaction = indexOfLastTransaction - rowsPerPage;
    const currentTransactions = account.transactions.slice(
      indexOfFirstTransaction,
      indexOfLastTransaction
    );

    return (
      <div className="transactions">
        <div className="transactions-header">
          <HeaderBox
            title="Transaction History"
            subtext="See your bank details and transactions."
          />
        </div>

        <div className="space-y-6">
          <div className="transactions-account">
            <div className="flex flex-col gap-2">
              <h2 className="text-18 font-bold text-white">
                {account?.data?.name}
              </h2>
              <p className="text-14 text-blue-25">
                {account?.data?.officialName}
              </p>
              <p className="text-14 font-semibold tracking-[1.1px] text-white">
                ●●●● ●●●● ●●●● {account?.data?.mask}
              </p>
            </div>

            <div className="transactions-account-balance">
              <p className="text-14">Current balance</p>
              <p className="text-24 text-center font-bold">
                {formatAmount(account?.data?.currentBalance)}
              </p>
            </div>
          </div>

          <section className="flex w-full flex-col gap-6">
            <TransactionsTable transactions={currentTransactions} />
            {totalPages > 1 && (
              <div className="my-4 w-full">
                <Pagination totalPages={totalPages} page={currentPage} />
              </div>
            )}
          </section>
        </div>
      </div>
    );
  } catch (error) {
    console.error("TransactionHistory Error:", error);
    return (
      <div className="text-center text-red-500">
        An unexpected error occurred.
      </div>
    );
  }
};

export default TransactionHistory;
