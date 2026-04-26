import { Routes, Route } from "react-router-dom";
import { ChatPlannerPage } from "./pages/ChatPlannerPage";
import { LandingPage } from "./pages/LandingPage";
import { TripResultPage } from "./pages/TripResultPage";
import { TripsDashboardPage } from "./pages/TripsDashboardPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/plan" element={<ChatPlannerPage />} />
      <Route path="/trips" element={<TripsDashboardPage />} />
      <Route path="/trip/:tripId" element={<TripResultPage />} />
    </Routes>
  );
}
