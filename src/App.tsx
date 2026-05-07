import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { VoyageProvider } from "@/context/VoyageContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { SheetProvider } from "@/context/SheetContext";
import { useSheets } from "@/context/sheetContextCore";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import AdminPanel from "./pages/AdminPanel";
import CalculationBreakdown from "./pages/CalculationBreakdown";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function SheetRouter() {
  const { currentView, setCurrentView, activeTab } = useSheets();

  if (currentView === "dashboard") {
    return <Dashboard />;
  }

  if (currentView === "admin") {
    return <AdminPanel onBack={() => setCurrentView("dashboard")} />;
  }

  // Wait for sheet data to load before mounting VoyageProvider
  if (activeTab?.isLoading) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">Loading sheet...</div>;
  }

  return (
    <VoyageProvider key={activeTab?.id || 'new'} initialData={activeTab?.data && Object.keys(activeTab.data).length > 0 ? activeTab.data : null}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/calculation-breakdown" element={<CalculationBreakdown />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </VoyageProvider>
  );
}

function AppContent() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Login />;
  }

  return <SheetRouter />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <SheetProvider>
          <Toaster />
          <Sonner />
          <AppContent />
        </SheetProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
