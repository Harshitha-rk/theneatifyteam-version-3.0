import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { Helmet } from "react-helmet-async";
import { supabase } from "./components/supabaseClient";

import Header from "./components/Header";
import CategoryTabs from "./components/CategoryTabs";
import ServiceCard from "./components/ServiceCard";
import { FiArrowUp, FiSearch, FiX, FiChevronRight } from "react-icons/fi";

import { calculateServicePrice } from "./utils/priceUtils";
import "./Services.css";

export default function Services({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const servicesRef = useRef(null);


  const [services, setServices] = useState([]);
  const [activeCategory, setActiveCategory] = useState(location.state?.lastCategory || "BATHROOM"); 
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [error, setError] = useState(null);

  const [heroImages, setHeroImages] = useState([]);
  const [currentHero, setCurrentHero] = useState(0);

  // App Popup State
  const [popupsQueue, setPopupsQueue] = useState([]);
  const [showPopup, setShowPopup] = useState(false);
  const [currentPopupIndex, setCurrentPopupIndex] = useState(0);
  const [isPopupPaused, setIsPopupPaused] = useState(false);


  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };



  // Priority: app_popups (announcements) take over offers.
  // If active announcements exist → show only them.
  // If no announcements → fall back to service offers.
  const fetchPopups = useCallback(async () => {
    try {
      const dismissedPopups = JSON.parse(sessionStorage.getItem("dismissedPopups") || "[]");

      // --- Step 1: Check for active announcements ---
      const { data: annData, error: annError } = await supabase
        .from("app_popups")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (annError) throw annError;

      const activeAnnouncements = (annData || []).filter(
        ann => !dismissedPopups.includes(ann.id)
      );

      if (activeAnnouncements.length > 0) {
        // Resolve image URLs from app_popups bucket
        const resolvedAnnouncements = activeAnnouncements.map(ann => {
          let resolvedUrl = null;
          if (ann.image_url) {
            if (ann.image_url.startsWith('http')) {
              resolvedUrl = ann.image_url;
            } else {
              const { data: img } = supabase.storage
                .from("app_popups")
                .getPublicUrl(ann.image_url);
              resolvedUrl = img?.publicUrl || null;
            }
          }
          return { ...ann, image_url: resolvedUrl, isAnnouncement: true };
        });

        setPopupsQueue(resolvedAnnouncements);
        setShowPopup(true);
        return; // ← Announcements found: skip offers
      }

      // --- Step 2: No announcements → fall back to service offers ---
      // Only skip if already shown this session (not per-ID, so admin re-enable always works)
      const offersAlreadyShown = sessionStorage.getItem("offersShown") === "true";
      if (offersAlreadyShown) return;

      const { data: offerData, error: offerError } = await supabase
        .from("offers")
        .select("*")
        .eq("is_offer_enabled", true)
        .order("created_at", { ascending: false });

      if (offerError) throw offerError;

      const activeOffers = offerData || [];

      if (activeOffers.length > 0) {
        const offerListSlide = {
          id: 'grouped-offers-list',
          isOfferList: true,
          offers: activeOffers,
          title: "Special Offers"
        };
        setPopupsQueue([offerListSlide]);
        setShowPopup(true);
      }
    } catch (err) {
      console.error("Error fetching popups:", err);
    }
  }, []);

  const handleClosePopup = () => {
    // When closing, we dismiss all popups currently in the queue
    const dismissedPopups = JSON.parse(sessionStorage.getItem("dismissedPopups") || "[]");

    popupsQueue.forEach(popup => {
      // Dismiss announcements per-ID
      if (popup.isAnnouncement && popup.id && !dismissedPopups.includes(popup.id)) {
        dismissedPopups.push(popup.id);
      }
      // For offers: just mark session as shown (not per-ID, so re-enable always works)
      if (popup.isOfferList) {
        sessionStorage.setItem("offersShown", "true");
      }
    });

    sessionStorage.setItem("dismissedPopups", JSON.stringify(dismissedPopups));
    setShowPopup(false);
    setPopupsQueue([]);
    setCurrentPopupIndex(0);
  };

  const handleNextPopup = useCallback((e) => {
    if (e) e.stopPropagation();
    if (popupsQueue.length > 0) {
      setCurrentPopupIndex(curr => (curr + 1) % popupsQueue.length);
    }
  }, [popupsQueue.length]);

  const handlePrevPopup = useCallback((e) => {
    if (e) e.stopPropagation();
    if (popupsQueue.length > 0) {
      setCurrentPopupIndex(curr => (curr - 1 + popupsQueue.length) % popupsQueue.length);
    }
  }, [popupsQueue.length]);

  // Auto-slide Logic
  useEffect(() => {
    let timer;
    if (showPopup && popupsQueue.length > 1 && !isPopupPaused) {
      timer = setInterval(() => {
        handleNextPopup();
      }, 5000); // Auto-slide every 5 seconds
    }
    return () => clearInterval(timer);
  }, [showPopup, popupsQueue.length, isPopupPaused, handleNextPopup]);

  const handleClaimOffer = (offer) => {
    // 1. Find the matching service
    const matchingService = services.find(s =>
      (s.service_type === offer.service_type || s.category === offer.service_type) &&
      s.title === offer.title
    );

    if (matchingService) {
      // 2. Persist claimed offer for the session (Calculated from MRP later)
      sessionStorage.setItem("claimedOffer", JSON.stringify({
        serviceId: matchingService.id,
        serviceTitle: matchingService.title,
        offerPercentage: offer.offer_percentage,
        offerPrice: offer.offer_price || offer.fixed_price, // Support either column name
        claimedAt: new Date().toISOString()
      }));

      // 3. Dismiss popup (add to session storage)
      const dismissedPopups = JSON.parse(sessionStorage.getItem("dismissedPopups") || "[]");
      if (!dismissedPopups.includes(offer.id)) {
        dismissedPopups.push(offer.id);
        sessionStorage.setItem("dismissedPopups", JSON.stringify(dismissedPopups));
      }

      // 4. Clear queue and hide
      setPopupsQueue([]);
      setShowPopup(false);

      // 5. Navigate to details
      navigate(`/service/${matchingService.slug || matchingService.id}`, {
        state: {
          service: matchingService,
          allServices: services,
          lastCategory: activeCategory
        },
      });
    } else {
      console.warn("No matching service found for offer:", offer);
      handleClosePopup();
    }
  };

  const fetchServices = useCallback(async () => {
    try {
      // 1. Fetch services sorted by category_order and then by sort_order
      const { data: servicesData, error: servicesError } = await supabase
        .from("services")
        .select("*")
        .order("category_order", { ascending: true })
        .order("sort_order", { ascending: true });
      if (servicesError) throw servicesError;

      // 2. Fetch active offers
      const { data: offersData, error: offersError } = await supabase
        .from("offers")
        .select("*")
        .eq("is_offer_enabled", true)
        .order("created_at", { ascending: false });

      if (offersError) {
        console.warn("Could not fetch offers for services list:", offersError);
      }

      const claimedOffer = JSON.parse(sessionStorage.getItem("claimedOffer") || "null");

      const transformed = (servicesData || []).map(s => {
        const pricing = calculateServicePrice(s, offersData, claimedOffer);

        return {
          ...s,
          price: pricing.price,
          discount_percent: pricing.discount_percent,
          discount_label: pricing.discount_label
        };
      });

      setServices(transformed);
    } catch (err) {
      console.error("Error in fetchServices:", err);
      setError("Failed to load services.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHeroImages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("web-hero-images")
        .select("image_path")
        .eq("is_active", true)
        .order("priority", { ascending: true });

      if (error || !data) {
        console.error("Error fetching hero metadata:", error);
        return;
      }

      const urls = data
        .map((row) => {
          if (!row.image_path) return null;

          if (row.image_path.startsWith("http")) {
            return row.image_path;
          }

          const { data: img } = supabase.storage
            .from("web-hero-images")
            .getPublicUrl(row.image_path);

          return img?.publicUrl;
        })
        .filter(Boolean);

      setHeroImages(urls);
    } catch (err) {
      console.error("Hero fetch exception:", err);
    }
  }, []);

  const tabs = useMemo(() => {
    const seen = new Set();
    const orderedTabs = [];

    // Since services are now ordered by category_order in the fetch call,
    // we just need to pick them up in the order they appear.
    services.forEach(s => {
      const type = s.service_type || s.category;
      if (type) {
        const upperType = type.toUpperCase();
        if (!seen.has(upperType)) {
          seen.add(upperType);
          orderedTabs.push({
            label: type
              .toLowerCase()
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase()),
            value: upperType,
          });
        }
      }
    });

    return orderedTabs.sort((a, b) => {
      if (a.value === "BATHROOM") return -1;
      if (b.value === "BATHROOM") return 1;
      return 0;
    }).concat({ label: "All Services", value: "ALL" });
  }, [services]);

  useEffect(() => {
    fetchServices();
    fetchHeroImages();
    fetchPopups();
  }, [fetchServices, fetchHeroImages, fetchPopups]);

  useEffect(() => {
    if ((!activeCategory || activeCategory === "") && tabs.length > 0) {
      const bathroomTab = tabs.find(t => t.value === "BATHROOM");
      if (bathroomTab) {
        setActiveCategory("BATHROOM");
      } else if (tabs.length > 0) {
        // Fallback to the first available tab if Bathroom isn't there yet
        // but only if we have more than just "All Services" or if it's the only choice.
        const defaultTab = tabs.find(t => t.value !== "ALL") || tabs[0];
        setActiveCategory(defaultTab.value);
      }
    }
  }, [tabs, activeCategory]);

  // Handle scroll to services section if coming back from detail page
  useEffect(() => {
    if (location.state?.fromDetail && !loading && services.length > 0) {
      setTimeout(() => {
        servicesRef.current?.scrollIntoView({ behavior: "smooth" });
        // Clear state to prevent scrolling back on refresh or other navigations
        navigate(location.pathname, { replace: true, state: {} });
      }, 100);
    }
  }, [location.state, loading, services, navigate, location.pathname]);

  useEffect(() => {
    if (heroImages.length > 0) setCurrentHero(0);
  }, [heroImages]);

  useEffect(() => {
    if (heroImages.length === 0) return;
    const interval = setInterval(() => {
      setCurrentHero((prev) => (prev + 1) % heroImages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [heroImages]);


  useEffect(() => {
    if (searchText.trim().length > 0) {
      setActiveCategory("ALL");
    }
  }, [searchText]);

  let filteredServices =
    (activeCategory === "ALL" || searchText.trim().length > 0)
      ? services
      : services.filter(
        (s) => (s.service_type || s.category)?.toUpperCase() === activeCategory?.toUpperCase()
      );

  filteredServices = filteredServices.filter((s) => {
    const input = searchText.toLowerCase().trim();
    if (!input) return true;
    return (
      s.title?.toLowerCase().includes(input) ||
      s.description?.toLowerCase().includes(input) ||
      (s.service_type || s.category)?.toLowerCase().includes(input)
    );
  });

  const groupedServices = useMemo(() => {
    const grouped = {};
    filteredServices.forEach((service) => {
      const category = service.service_type || service.category || "Other";
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(service);
    });

    Object.keys(grouped).forEach((category) => {
      grouped[category].sort(
        (a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)
      );
    });

    return grouped;
  }, [filteredServices]);

  return (
    <div className="page">
      {/* Automated Slideshow Popup */}
      {showPopup && popupsQueue.length > 0 && (
        <div className="popup-backdrop" onClick={handleClosePopup}>
          <div
            className="popup-slideshow-container static-list-container"
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => setIsPopupPaused(true)}
            onMouseLeave={() => setIsPopupPaused(false)}
          >
            <button className="popup-close-btn-fixed" onClick={handleClosePopup}>
              <FiX size={24} />
            </button>

            {/* Navigation Arrows if more than one popup */}
            {popupsQueue.length > 1 && (
              <>
                <button className="popup-nav-btn prev" onClick={handlePrevPopup}>
                  <FiChevronRight size={28} style={{ transform: 'rotate(180deg)' }} />
                </button>
                <button className="popup-nav-btn next" onClick={handleNextPopup}>
                  <FiChevronRight size={28} />
                </button>
              </>
            )}

            <div className="single-slide-wrapper">
              <div className="popup-slide-track" style={{ transform: `translateX(-${currentPopupIndex * 100}%)` }}>
                {popupsQueue.map((popup, idx) => (
                  <div key={popup.id} className="popup-slide">
                    <div className={`popup-container-inner ${popup.isOfferList ? 'offer-list-layout' : popup.isAnnouncement ? 'announcement-layout' : ''}`}>
                      <div className="popup-slide-content">
                        {popup.isOfferList ? (
                          <div className="popup-offer-list-redesign">
                            <div className="popup-list-header">
                              <h2>🎉 {popup.title || "Special Offers"}</h2>
                            </div>
                            <div className="offer-items-container">
                              {popup.offers.map((offer) => (
                                <div key={offer.id} className="reference-offer-item" onClick={() => handleClaimOffer(offer)}>
                                  <div className="offer-main-content">
                                    <span className="offer-category-tag">{offer.service_type?.replace(/_/g, " ").toUpperCase()}</span>
                                    <h3 className="offer-item-title">{offer.title}</h3>
                                    <p className="offer-item-subtitle">use this offer</p>
                                  </div>
                                  <div className="offer-right-content">
                                    <div className="reference-discount-badge">
                                      {offer.offer_percentage}% OFF
                                    </div>
                                    <FiChevronRight size={24} className="offer-arrow-icon" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : popup.isAnnouncement ? (
                          <div className="popup-announcement-redesign">
                            {popup.image_url && (
                              <div className="announcement-image-wrapper">
                                <img
                                  src={popup.image_url}
                                  alt={popup.title}
                                  className="announcement-img"
                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                              </div>
                            )}
                            <div className="announcement-text-content">
                              <span className="announcement-tag">{popup.type || "NEW"}</span>
                              <h2 className="announcement-title">{popup.title}</h2>
                              {popup.description && (
                                <p className="announcement-desc">{popup.description}</p>
                              )}
                              <button className="announcement-action-btn" onClick={idx === popupsQueue.length - 1 ? handleClosePopup : handleNextPopup}>
                                {idx === popupsQueue.length - 1 ? "Got it!" : "Next"}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Indicators / Dots */}
            {popupsQueue.length > 1 && (
              <div className="popup-indicators">
                {popupsQueue.map((_, idx) => (
                  <div
                    key={idx}
                    className={`indicator-dot ${idx === currentPopupIndex ? 'active' : ''}`}
                    onClick={() => setCurrentPopupIndex(idx)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <Helmet>
        <title>The Neatify Team | Cleaning Services in Hyderabad</title>
        <meta
          name="description"
          content="Book professional bathroom cleaning, kitchen cleaning and deep cleaning services in Hyderabad, Pragathi Nagar and Bachupally."
        />
        <link rel="canonical" href="https://www.theneatifyteam.in/services" />
        <script type="application/ld+json">
          {`
            {
              "@context": "https://schema.org",
              "@type": "LocalBusiness",
              "name": "The Neatify Team",
              "image": "https://www.theneatifyteam.in/logo192.png",
              "@id": "https://www.theneatifyteam.in/",
              "url": "https://www.theneatifyteam.in/",
              "telephone": "+917617618567",
              "address": {
                "@type": "PostalAddress",
                "streetAddress": "Pragathi Nagar, Bachupally",
                "addressLocality": "Hyderabad",
                "postalCode": "500090",
                "addressRegion": "Telangana",
                "addressCountry": "IN"
              },
              "geo": {
                "@type": "GeoCoordinates",
                "latitude": 17.5342,
                "longitude": 78.3702
              },
              "openingHoursSpecification": {
                "@type": "OpeningHoursSpecification",
                "dayOfWeek": [
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                  "Sunday"
                ],
                "opens": "08:00",
                "closes": "20:00"
              }
            }
          `}
        </script>
      </Helmet>

      <Header searchText={searchText} setSearchText={setSearchText} user={user} allServices={services} />

      {heroImages.length > 0 && (
        <div className="hero-container">
          <div
            className="hero"
            style={{ backgroundImage: `url(${heroImages[currentHero]})` }}
          />
          <div className="hero-dots">
            {heroImages.map((_, index) => (
              <span
                key={index}
                className={`dot ${index === currentHero ? "active" : ""}`}
                onClick={() => setCurrentHero(index)}
              />
            ))}
          </div>
        </div>
      )}

      <div id="services-section" ref={servicesRef} style={{ scrollMarginTop: "90px" }}>
        <CategoryTabs
          activeTab={activeCategory}
          onChange={(cat) => {
            setActiveCategory(cat);
            setSearchText("");
          }}
          tabs={tabs}
        />

        {loading ? (
          <div className="loader">Loading services...</div>
        ) : error ? (
          <div className="error">{error}</div>
        ) : filteredServices.length === 0 ? (
          <div className="no-services-container">
            <div className="no-services-content">
              <div className="no-services-icon-wrapper">
                <FiSearch size={48} />
              </div>
              <h3>No services found</h3>
              <p>
                We couldn't find any services matching "{searchText}". Try searching for something else or clear your search.
              </p>
              <button className="clear-search-btn" onClick={() => setSearchText("")}>
                Clear Search
              </button>
            </div>
          </div>
        ) : (
          <>
            {Object.entries(groupedServices).map(([category, items]) => (
              <section key={category} className="service-category">
                <h2 className="category-title">
                  {category
                    .toLowerCase()
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase())}
                </h2>

                <div className="services-grid">
                  {items.map((service) => (
                    <ServiceCard
                      key={service.id}
                      service={service}
                      onView={() =>
                        navigate(`/service/${service.slug || service.id}`, {
                          state: {
                            service,
                            allServices: services,
                            lastCategory: activeCategory
                          },
                        })
                      }
                    />
                  ))}
                </div>
              </section>
            ))}

            <div className="services-go-up-wrapper">
              <button
                className="services-go-up"
                onClick={scrollToTop}
                aria-label="Go to top"
              >
                <FiArrowUp />
              </button>
            </div>
          </>
        )}
      </div>

      {/* ✅ Hidden SEO Section (Background) */}
      <section style={{
        position: 'absolute',
        left: '-9999px',
        width: '1px',
        height: '1px',
        overflow: 'hidden'
      }}>
        <h2>Trusted Cleaning Services in Hyderabad</h2>
        <p>
          The Neatify Team provides professional home cleaning services in Hyderabad,
          including bathroom cleaning, kitchen cleaning and deep cleaning solutions.
          We proudly serve areas like Pragathi Nagar and Bachupally with reliable,
          affordable and high-quality cleaning services.
        </p>

        <h2>Why Choose Our Cleaning Experts?</h2>
        <p>
          Our trained professionals use safe cleaning products and modern equipment
          to deliver hygienic and spotless results. Whether you need bathroom cleaning
          or full home deep cleaning in Hyderabad, we ensure complete customer satisfaction.
        </p>

        <h2>Comprehensive Home Cleaning Solutions</h2>
        <p>
          We offer bathroom cleaning, kitchen cleaning, deep cleaning, move-in cleaning
          and commercial cleaning services across Hyderabad.
        </p>

        <h2>Frequently Asked Questions</h2>

        <h3>How much does home cleaning cost in Hyderabad?</h3>
        <p>
          The cost depends on the type of cleaning service and property size.
        </p>

        <h3>Do you provide cleaning services in Pragathi Nagar and Bachupally?</h3>
        <p>
          Yes, we provide professional cleaning services in Hyderabad.
        </p>
      </section>
    </div>
  );
}