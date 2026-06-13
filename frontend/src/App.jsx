import { BrowserRouter, Routes, Route } from 'react-router-dom'
import React from "react";
import HomePage from './pages/HomePage'
import CallPage from './pages/CallPage'
import OfferPage from './pages/OfferPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/call/:token" element={<CallPage />} />
        <Route path="/offer/:token" element={<OfferPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App