import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider, useLocation, useRouteError } from "react-router";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./styles.css";
import { ApiError } from "./lib/api";
import { SessionProvider, useSession } from "./lib/session";
import { ToastProvider, Spinner, ErrorState } from "./components/ui";
import { AppShell } from "./components/shell";
import { LoginPage, RegisterPage } from "./pages/auth";
import { HomePage } from "./pages/home";
import { BookmarksPage, ExplorePage, NotificationsPage, PostPage, ProfilePage, SearchPage, SocialFeedPage, TagPage } from "./pages/social";
import { CommunityPage, ConnectHomePage, InvitePage, MessagesPage } from "./pages/connect";
import { SettingsPage } from "./pages/settings";
import { AreaPage, ChangelogPage, ModerationPage, NotFoundPage } from "./pages/platform";

const onAuthError = (e: unknown) => {
  // A 401 anywhere means the session ended (signed out elsewhere, suspended, expired).
  if (e instanceof ApiError && e.status === 401 && !location.pathname.startsWith("/login") && !location.pathname.startsWith("/register")) {
    queryClient.setQueryData(["me"], null);
  }
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onAuthError }),
  mutationCache: new MutationCache({ onError: onAuthError }),
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2,
    },
  },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useSession();
  const loc = useLocation();
  if (loading) return <Spinner label="Loading SythiX Unite" />;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children}</>;
}

function RouteError() {
  const err = useRouteError();
  return (
    <div className="mx-auto max-w-md p-10">
      <ErrorState error={err instanceof Error ? err : new Error("This page failed to load.")} retry={() => location.reload()} />
    </div>
  );
}

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "social", element: <SocialFeedPage /> },
      { path: "social/explore", element: <ExplorePage /> },
      { path: "social/bookmarks", element: <BookmarksPage /> },
      { path: "social/post/:id", element: <PostPage /> },
      { path: "social/tag/:tag", element: <TagPage /> },
      { path: "search", element: <SearchPage /> },
      { path: "u/:username", element: <ProfilePage /> },
      { path: "notifications", element: <NotificationsPage /> },
      { path: "connect", element: <ConnectHomePage /> },
      { path: "connect/c/:slug", element: <CommunityPage /> },
      { path: "connect/c/:slug/:channelId", element: <CommunityPage /> },
      { path: "connect/dm", element: <MessagesPage /> },
      { path: "connect/dm/:id", element: <MessagesPage /> },
      { path: "invite/:code", element: <InvitePage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "settings/:section", element: <SettingsPage /> },
      { path: "mod", element: <ModerationPage /> },
      { path: "areas/:area", element: <AreaPage /> },
      { path: "changelog", element: <ChangelogPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
