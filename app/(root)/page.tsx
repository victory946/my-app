"use client"; // Convert to Client Component

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import HeaderBox from "@/components/HeaderBox";
import RecentTransactions from "@/components/RecentTransactions";
import RightSidebar from "@/components/RightSidebar";
import TotalBalanceBox from "@/components/TotalBalanceBox";
import { getAccount, getAccounts } from "@/lib/actions/bank.actions";
import { getLoggedInUser } from "@/lib/actions/user.actions";

const Home = () => {
  const searchParams = useSearchParams();
  const id = searchParams?.get("id") || "";
  const currentPage = Number(searchParams?.get("page")) || 1;

  const [loggedIn, setLoggedIn] = useState<any>(null);
  const [accounts, setAccounts] = useState<any>(null);
  const [account, setAccount] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // Fetch logged-in user
      const user = await getLoggedInUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setLoggedIn(user);

      // Fetch user accounts
      const userAccounts = await getAccounts({ userId: user.$id });
      if (!userAccounts || !userAccounts.data?.length) {
        setLoading(false);
        return;
      }

      setAccounts(userAccounts);

      // Fetch the selected account
      const appwriteItemId = id || userAccounts.data[0]?.appwriteItemId;
      const selectedAccount = await getAccount({ appwriteItemId });
      setAccount(selectedAccount);

      setLoading(false);
    };

    fetchData();
  }, [id]);

  if (loading) return <div className="text-center text-gray-500">Loading...</div>;

  if (!loggedIn) {
    return (
      <div className="text-center text-red-500">
        Please log in to view your account.
      </div>
    );
  }

  if (!accounts || !accounts.data?.length) {
    return <div className="text-center text-gray-500">No accounts found.</div>;
  }

  return (
    <section className="home">
      <div className="home-content">
        <header className="home-header">
          <HeaderBox
            type="greeting"
            title="Welcome"
            user={loggedIn?.firstName || "Guest"}
            subtext="Access and manage your account and transactions efficiently."
          />

          <TotalBalanceBox
            accounts={accounts.data}
            totalBanks={accounts?.totalBanks}
            totalCurrentBalance={accounts?.totalCurrentBalance}
          />
        </header>

        <RecentTransactions
          accounts={accounts.data}
          transactions={account?.transactions || []}
          appwriteItemId={id}
          page={currentPage}
        />
      </div>

      <RightSidebar
        user={loggedIn}
        transactions={account?.transactions || []}
        banks={accounts.data?.slice(0, 2)}
      />
    </section>
  );
};

export default Home;
