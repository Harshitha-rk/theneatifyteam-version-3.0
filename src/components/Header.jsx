import React, { useState, useMemo } from "react";

import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { FiSearch, FiX, FiUser, FiChevronRight } from "react-icons/fi";
import "./Header.css";

const POPULAR_SUGGESTIONS = [
  "Deep Cleaning",
  "Kitchen Cleaning",
  "Bathroom Cleaning",
  "Pest Control",
  "Sofa Cleaning",
  "Full House Cleaning"
];

export default function Header({
  searchText: propSearchText,
  setSearchText: propSetSearchText,
  user,
  allServices = []
}) {

  const navigate = useNavigate();
  const location = useLocation();

  // Handle optional search props for standalone use on other pages
  const [internalSearchText, setInternalSearchText] = useState("");
  const searchText = propSearchText !== undefined ? propSearchText : internalSearchText;
  const setSearchText = propSetSearchText || setInternalSearchText;

  const filteredLiveResults = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    if (!term) return [];
    return allServices
      .filter((s) => {
        return (
          s.title?.toLowerCase().includes(term) ||
          s.description?.toLowerCase().includes(term) ||
          (s.category || s.service_type)?.toLowerCase().includes(term)
        );
      })
      .slice(0, 10);
  }, [allServices, searchText]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);

  const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.theneatifyteam.app";

  const handleProfile = () => {
    setDropdownOpen(false);
    navigate("/profile");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setDropdownOpen(false);
    navigate("/login");
  };

  const goHome = () => {
    navigate("/", { replace: false });
  };

  const goServices = () => {
    const scrollToServices = () => {
      const section = document.getElementById("services-section");
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    if (location.pathname === "/services") {
      scrollToServices();
    } else {
      navigate("/services", { replace: false });
      setTimeout(scrollToServices, 300);
    }
  };

  return (
    <>
      <header className="header">
        <div className="header-top">
          <div className="header-left">
            <img
              src="/logo.png"
              alt="The Neatify Team"
              className="logo"
              onClick={goHome}
            />

            <div className="nav-links desktop-only">
              <span onClick={goHome}>Home</span>
              <span onClick={goServices}>Services</span>
              <span
                onClick={() =>
                  document
                    .getElementById("contact")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Contact
              </span>
              <span onClick={() => setHelpOpen(true)}>Help</span>
            </div>
          </div>



          <div className="header-icons">
            {/* DESKTOP SEARCH */}
            <div className="search-wrapper desktop-only">
              <FiSearch size={16} />
              <input
                type="text"
                placeholder="Search for services..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onFocus={() => { }}
                onBlur={() => { }}
              />
              {searchText && (
                <button onClick={() => setSearchText("")} className="clear-btn-search">
                  <FiX size={14} />
                </button>
              )}

            </div>
            {/* MOBILE SEARCH ICON */}
            {!mobileSearchOpen && (
              <button
                className="mobile-search-icon"
                onClick={() => setMobileSearchOpen(true)}
              >
                <FiSearch size={20} />
              </button>
            )}

            {/* MOBILE SEARCH OVERLAY */}
            {mobileSearchOpen && (
              <div className="mobile-search-open">
                <div className="search-wrapper" style={{ width: '100%', maxWidth: 'none' }}>
                  <FiSearch size={18} />
                  <input
                    type="text"
                    placeholder="Search services..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setMobileSearchOpen(false);
                      }
                    }}
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      if (searchText) {
                        setSearchText("");
                      } else {
                        setMobileSearchOpen(false);
                      }
                    }}
                  >
                    <FiX size={18} />
                  </button>
                </div>

                <div className="search-suggestions">
                  {!searchText.trim() ? (
                    <>
                      <h3>Popular Searches</h3>
                      <div className="suggestion-chips">
                        {POPULAR_SUGGESTIONS.map((suggestion, idx) => (
                          <div
                            key={idx}
                            className="suggestion-chip"
                            onClick={() => setSearchText(suggestion)}
                          >
                            {suggestion}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : filteredLiveResults.length > 0 ? (
                    <>
                      <h3>Search Results</h3>
                      <div className="search-results-list">
                        {filteredLiveResults.map((s) => (
                          <div
                            key={s.id}
                            className="search-result-item"
                            onClick={() => {
                              setMobileSearchOpen(false);
                              navigate(`/service/${s.id}`, {
                                state: { service: s, allServices },
                              });
                            }}
                          >
                            <span className="result-title">{s.title}</span>
                            <FiChevronRight size={18} color="#9ca3af" />
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="no-results-mobile">
                      <p>No services found matching "{searchText}"</p>
                    </div>
                  )}
                </div>

                <button
                  className="my-bookings-btn"
                  style={{ width: "100%", marginTop: "auto", marginBottom: "20px" }}
                  onClick={() => {
                    setMobileSearchOpen(false);
                    goServices();
                  }}
                >
                  Show Results
                </button>
              </div>
            )}

            <button
              onClick={() => setDownloadModalOpen(true)}
              className="my-bookings-btn desktop-only"
            >
              Download
            </button>

            {
              user ? (
                <>
                  <button
                    className="my-bookings-btn desktop-only"
                    onClick={() => navigate("/my-bookings")}
                  >
                    My Bookings
                  </button>

                  <div className="user-menu">
                    <div
                      className="user-circle"
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                    >
                      <FiUser size={18} />
                    </div>

                    {dropdownOpen && (
                      <div className="dropdown">
                        <p onClick={handleProfile}>Profile</p>
                        <p onClick={() => navigate("/my-bookings")}>
                          My Bookings
                        </p>
                        <p onClick={handleLogout}>Logout</p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <button
                  className="my-bookings-btn"
                  onClick={() => navigate("/login")}
                >
                  Login
                </button>
              )
            }

            <button
              className="mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(true)}
            >
              ☰
            </button>
          </div >
        </div >
      </header >

      {/* ✅ MOBILE SIDEBAR */}
      {
        mobileMenuOpen && (
          <div className="mobile-menu-overlay" onClick={() => setMobileMenuOpen(false)}>
            <div className="mobile-menu-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="mobile-menu-header">
                <img src="/logo.png" alt="The Neatify Team" className="logo" style={{ height: '32px' }} />
                <button
                  className="close-btn"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  ✕
                </button>
              </div>

              <div className="mobile-links">
                <div className="mobile-link-item" onClick={() => { goHome(); setMobileMenuOpen(false); }}>
                  Home
                </div>

                <div className="mobile-link-item" onClick={() => { goServices(); setMobileMenuOpen(false); }}>
                  Services
                </div>

                <div className="mobile-link-item download-item" onClick={() => { setDownloadModalOpen(true); setMobileMenuOpen(false); }}>
                  Download App
                </div>

                <div
                  className="mobile-link-item"
                  onClick={() => {
                    document
                      .getElementById("contact")
                      ?.scrollIntoView({ behavior: "smooth" });
                    setMobileMenuOpen(false);
                  }}
                >
                  Contact
                </div>

                <div className="mobile-link-item" onClick={() => { setHelpOpen(true); setMobileMenuOpen(false); }}>
                  Help
                </div>

                {user ? (
                  <>
                    <div className="mobile-link-item" onClick={() => { navigate("/profile"); setMobileMenuOpen(false); }}>
                      Profile
                    </div>
                    <div className="mobile-link-item" onClick={() => { navigate("/my-bookings"); setMobileMenuOpen(false); }}>
                      My Bookings
                    </div>
                    <div className="mobile-link-item logout" onClick={() => { handleLogout(); setMobileMenuOpen(false); }}>
                      Logout
                    </div>
                  </>
                ) : (
                  <div className="mobile-link-item" onClick={() => { navigate("/login"); setMobileMenuOpen(false); }}>
                    Login
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      }

      {/* ✅ HELP MODAL */}
      {
        helpOpen && (
          <div className="help-overlay" onClick={() => setHelpOpen(false)}>
            <div className="help-modal" onClick={(e) => e.stopPropagation()}>
              <button className="help-close" onClick={() => setHelpOpen(false)}>
                ✕
              </button>
              <h2 style={{ marginBottom: "20px", color: "#f4c430" }}>Need Help?</h2>
              <p style={{ fontSize: "16px", marginBottom: "15px" }}>
                Our support team is available 24/7. Feel free to call us for any assistance.
              </p>
              <div
                style={{
                  background: "#f9fafb",
                  padding: "15px",
                  borderRadius: "10px",
                  marginBottom: "20px",
                }}
              >
                <p style={{ fontWeight: "600", fontSize: "18px" }}>Call us at:</p>
                <a
                  href="tel:+917617618567"
                  style={{
                    fontSize: "20px",
                    color: "#000",
                    textDecoration: "underline",
                  }}
                >
                  +91 7617618567
                </a>
              </div>
              <button
                className="my-bookings-btn"
                style={{ width: "100%" }}
                onClick={() => setHelpOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        )
      }

      {/* ✅ DOWNLOAD MODAL */}
      {
        downloadModalOpen && (
          <div className="help-overlay" onClick={() => setDownloadModalOpen(false)}>
            <div className="help-modal" onClick={(e) => e.stopPropagation()} style={{ width: '380px', maxWidth: '90%' }}>
              <button className="help-close" onClick={() => setDownloadModalOpen(false)}>
                ✕
              </button>
              <h2 style={{ marginBottom: "15px", color: "#f4c430" }}>Download The Neatify Team App</h2>
              <p style={{ fontSize: "16px", marginBottom: "20px", color: "#4b5563" }}>
                Experience the best cleaning services from your smartphone.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {/* PLAY STORE */}
                <a
                  href={PLAY_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="my-bookings-btn"
                  style={{ gap: '10px' }}
                >
                  <img src="/google-play_3128279.png" alt="" style={{ height: '24px' }} />
                  Get it on Google Play
                </a>

                {/* APP STORE */}
                <button
                  className="my-bookings-btn"
                  disabled
                  style={{ background: '#f3f4f6', color: '#9ca3af', cursor: 'not-allowed', gap: '10px' }}
                >
                  <img src="/apple.png" alt="" style={{ height: '24px', opacity: 0.5 }} />
                  Coming Soon on App Store
                </button>
              </div>

              <div style={{ marginTop: '25px', padding: '15px', border: '1px solid #f1f5f9', borderRadius: '12px', background: '#f9fafb' }}>
                <p style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px' }}>Scan to Download (Play Store)</p>
                <img
                  src="/The Neatify Team App Playstore QR-Code.png"
                  alt="Play Store QR Code"
                  style={{ width: '120px', height: '120px', margin: '0 auto' }}
                />
              </div>
            </div>
          </div>
        )
      }

    </>
  );
}