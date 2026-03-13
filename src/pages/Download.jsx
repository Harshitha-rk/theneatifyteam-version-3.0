import React from "react";
import { Helmet } from "react-helmet-async";
import "./Download.css";

import playStoreImg from "./google-play_3128279.png";
import appleImg from "./apple.png"; // ✅ USE APPLE IMAGE

export default function Download() {
  return (
    <div className="download-wrapper">
      <Helmet>
        <title>Download Neatify App | The Neatify Team</title>
        <link rel="canonical" href="https://www.theneatifyteam.in/download" />
      </Helmet>
      <div className="download-card">
        <h1>Neatify is Now on Google Play!</h1>
        <p className="subtitle">
          Experience the best cleaning services right from your smartphone.
          Download our official app now.
        </p>

        <a
          href="https://play.google.com/store/apps/details?id=com.theneatifyteam.app"
          target="_blank"
          rel="noopener noreferrer"
          className="playstore-btn-active"
        >
          Get it on Google Play
        </a>

        <div className="store-list">
          {/* PLAY STORE */}
          <div className="store-item playstore">
            <img src={playStoreImg} alt="Play Store" />
            <span>Play Store</span>
          </div>

          {/* APP STORE */}
          <div className="store-item appstore">
            <img src={appleImg} alt="App Store" />
            <span>Coming Soon on App Store</span>
          </div>
        </div>

        <div className="qr-section">
          <p className="api-text">Scan to Download</p>
          <img
            src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://play.google.com/store/apps/details?id=com.theneatifyteam.app"
            alt="Play Store QR Code"
            className="qr-code-img"
          />
        </div>
      </div>
    </div>
  );
}
