import { useLocation, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiSearch } from "react-icons/fi";
import { Helmet } from "react-helmet-async";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import "./Payment.css";
import { supabase } from "../components/supabaseClient";
import { processPayment } from "../Services/PaymentService";
import Header from "../components/SampleHeader";
import { parseDurationToMinutes, formatDuration } from "../utils/durationUtils";

import { useToast } from "../components/Toast/ToastContext";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const getCurrency = (value) => {
  if (!value) return "₹"; // Fallback
  const match = String(value).match(/^([^\d\s]+)/);
  return match ? match[1] : "₹";
};

const formatPrice = (value) => {
  if (value === 0 || value === "0") return "0";
  if (!value) return "";
  // If it's already a number, just return it
  if (typeof value === "number") return value;
  // If it's a string, strip the currency symbol
  return value.toString().replace(/^[^\d\s]+\s*/, "");
};

const formatTotalAddress = (data, fallbackParts) => {
  if (data.display_name) {
    // Split by comma and clean redundant/administrative noise
    const rawParts = data.display_name.split(",").map(p => p.trim());

    // Deduplicate parts while preserving order
    const uniqueParts = [];
    const seen = new Set();

    for (const p of rawParts) {
      const lowP = p.toLowerCase();
      // Skip if it's a bare Pin code (handled at the end)
      if (/^\d{6}$/.test(p)) continue;

      // Skip redundant or noise markers (like 'mandal', 'ward')
      const noiseMarkers = ["mandal", "ward", "department"];
      if (noiseMarkers.some(m => lowP.includes(m))) continue;

      if (!seen.has(lowP)) {
        uniqueParts.push(p);
        seen.add(lowP);
      }
    }

    const result = uniqueParts.join(", ");
    if (result) return result;
  }
  const fallback = fallbackParts.filter(Boolean).join(", ");
  return fallback || "Pinned Location";
};

export default function Payment({ user }) {
  const location = useLocation();
  const navigate = useNavigate();

  const toast = useToast();

  let { services = [], date, time, month, year } = location.state || {};
  if (typeof services === "string") services = JSON.parse(services);

  const [selectedServices, setSelectedServices] = useState(services || []);
  const successProcessingRef = useRef(false);

  const currency = useMemo(() => {
    const firstService = selectedServices[0];
    return getCurrency(firstService?.price || firstService?.original_price);
  }, [selectedServices]);

  const fetchFreshData = useCallback(async () => {
    if (selectedServices.length === 0) return;

    const ids = selectedServices.map((s) => s.id).filter(Boolean);
    if (ids.length === 0) return;

    const { data: servicesData } = await supabase
      .from("services")
      .select("*")
      .in("id", ids);

    const { data: addonsData } = await supabase
      .from("add_ons")
      .select("*")
      .in("id", ids);

    const freshMap = new Map();
    if (servicesData) servicesData.forEach((s) => freshMap.set(s.id, s));
    if (addonsData) addonsData.forEach((s) => freshMap.set(s.id, s));

    // Get claimed offer from session storage
    let claimedOffer = null;
    try {
      const stored = sessionStorage.getItem("claimedOffer");
      if (stored) claimedOffer = JSON.parse(stored);
    } catch (e) {
      console.error("Error parsing claimedOffer:", e);
    }

    const { data: offersData } = await supabase
      .from("offers")
      .select("*")
      .eq("is_offer_enabled", true)
      .order("created_at", { ascending: false });

    const updatedServices = selectedServices.map((s) => {
      const fresh = freshMap.get(s.id);
      if (fresh) {
        const isClaimed = claimedOffer && claimedOffer.serviceId === fresh.id;

        // 1. Check for active offer override in DB
        const matchingOffer = (offersData || []).find(o => o.title === fresh.title);

        // 2. Determine base price and discount from various sources
        let finalPrice = fresh.price;
        let finalDiscountPercent = parseFloat(fresh.discount_percent) || 0;
        let finalDiscountLabel = (fresh.discount_label ? fresh.discount_label.toUpperCase() : null) || (finalDiscountPercent > 0 ? `${finalDiscountPercent}% OFF` : null);

        if (isClaimed) {
          finalPrice = claimedOffer.offerPrice !== undefined ? claimedOffer.offerPrice : fresh.price;
          finalDiscountPercent = claimedOffer.offerPercentage;
          finalDiscountLabel = `${claimedOffer.offerPercentage}% OFF`;
        } else if (matchingOffer) {
          const offerPrice = matchingOffer.offer_price || matchingOffer.fixed_price;
          const offerPct = parseFloat(matchingOffer.offer_percentage) || 0;
          const originalPrice = fresh.original_price ? parseFloat(String(fresh.original_price).replace(/[^\d.]/g, "")) : null;

          if (offerPrice !== undefined && offerPrice !== null) {
            finalPrice = offerPrice;
          } else if (originalPrice && offerPct > 0) {
            finalPrice = Math.round(originalPrice * (1 - offerPct / 100));
          }

          finalDiscountPercent = offerPct;
          finalDiscountLabel = offerPct > 0 ? `${offerPct}% OFF` : "SPECIAL OFFER";
        }

        return {
          ...s,
          ...fresh,
          price: finalPrice,
          discount_percent: finalDiscountPercent,
          discount_label: finalDiscountLabel,
          quantity: s.quantity,
        };
      }
      return s;
    });

    setSelectedServices(updatedServices);
  }, [selectedServices]);

  useEffect(() => {
    fetchFreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchFreshData]);


  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [couponRemovedByUser, setCouponRemovedByUser] = useState(false);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [message, setMessage] = useState("");

  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [locationAccuracy, setLocationAccuracy] = useState(null);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [isAddressSummaryMode, setIsAddressSummaryMode] = useState(false);
  const [hasUsedLocationFetch, setHasUsedLocationFetch] = useState(false);
  const [isCheckingPincode, setIsCheckingPincode] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  const [showPincodeAlert, setShowPincodeAlert] = useState(false);
  const [showPaymentFailAlert, setShowPaymentFailAlert] = useState(false);
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [pendingBookingData, setPendingBookingData] = useState(null);
  const [criticalError, setCriticalError] = useState(null);

  const [acceptPolicies, setAcceptPolicies] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalContent, setModalContent] = useState("");
  const [loadingPolicy, setLoadingPolicy] = useState(false);

  const [isPaying, setIsPaying] = useState(false);
  const lockRef = useRef(false);
  const [paymentErrorMsg, setPaymentErrorMsg] = useState("");

  const [isPincodeServiceable, setIsPincodeServiceable] = useState(true);
  const lastGeocodeRequestId = useRef(0);
  const toastRef = useRef(toast);

  // Keep toastRef updated but don't use it as a dependency for hooks
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);



  const finalizeLocation = useCallback(async (position, requestId, isBg) => {
    const { latitude: lat, longitude: lng, accuracy } = position.coords;

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=en&zoom=18`,
        {
          headers: { "Accept-Language": "en-US,en" }
        }
      );
      if (requestId !== lastGeocodeRequestId.current) return;
      const data = await response.json();

      if (data && data.address) {
        const addr = data.address;
        const fetchedZip = addr.postcode || "";
        const fetchedCity = addr.city || addr.town || addr.village || addr.county || "";
        const parts = [];

        if (addr.amenity) parts.push(addr.amenity);
        if (addr.office) parts.push(addr.office);
        if (addr.shop) parts.push(addr.shop);
        if (addr.tourism) parts.push(addr.tourism);
        if (addr.leisure) parts.push(addr.leisure);
        if (addr.building) parts.push(addr.building);
        if (addr.house_number) parts.push(addr.house_number);
        if (addr.road) parts.push(addr.road);
        if (addr.neighbourhood) parts.push(addr.neighbourhood);
        if (addr.residential) parts.push(addr.residential);
        if (addr.suburb) parts.push(addr.suburb);
        if (addr.city_district) parts.push(addr.city_district);
        if (fetchedCity) parts.push(fetchedCity);

        // Geocoding fallback
        let fetchedAddress = formatTotalAddress(data, parts);

        let finalZip = fetchedZip;
        const isPragathiNagar = fetchedAddress?.toLowerCase().includes("pragathi nagar") ||
          (data.display_name && data.display_name.toLowerCase().includes("pragathi nagar"));

        if (isPragathiNagar && (fetchedZip === "501002" || !fetchedZip)) {
          finalZip = "500090";
        }

        let finalAddress = fetchedAddress;
        if ((finalZip === "500090" || finalZip === "501002") && !finalAddress.toLowerCase().includes("hyderabad")) {
          finalAddress += ", Hyderabad";
        }

        // Prevent zip/pincode doubling: check if address already ends with the zip
        const displayAddress = (finalZip && !finalAddress.includes(finalZip))
          ? `${finalAddress} - ${finalZip}`
          : finalAddress;

        // Background fetch vs User click
        if (isBg) {
          setAddress(prev => prev || displayAddress);
          if (fetchedCity) setCity(prev => prev || fetchedCity);
          if (finalZip) setZip(prev => prev || finalZip);
        } else {
          setAddress(displayAddress);
          if (fetchedCity) setCity(fetchedCity);
          if (finalZip) setZip(finalZip);
          setHasUsedLocationFetch(true);
          setIsAddressSummaryMode(true);
          toastRef.current.success(`Location refined! (Accuracy: ${Math.round(accuracy)}m)`);
        }
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      if (!isBg) toastRef.current.error("Failed to fetch address details");
    } finally {
      if (!isBg) setIsFetchingLocation(false);
    }
  }, []);

  const fetchCurrentLocation = useCallback((isBackground = false) => {
    const isBg = isBackground === true;
    if (!navigator.geolocation) return;

    if (!isBg) setIsFetchingLocation(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lng, accuracy } = position.coords;

        setLatitude(prev => (!prev || !isBg) ? lat : prev);
        setLongitude(prev => (!prev || !isBg) ? lng : prev);
        setLocationAccuracy(accuracy); // Always update accuracy for better feedback

        finalizeLocation(position, ++lastGeocodeRequestId.current, isBg);

        if (!isBg) setIsFetchingLocation(false);
      },
      (error) => {
        if (!isBg) {
          setIsFetchingLocation(false);
          let errorMsg = "Geolocation failed.";
          if (error.code === 1) errorMsg = "Location access denied. Please allow access in settings.";
          else if (error.code === 3) errorMsg = "Location request timed out. Please try again or use 'Pick on Map'.";
          toastRef.current.error(errorMsg);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000, // Increased timeout for better stability
        maximumAge: 0
      }
    );
  }, [finalizeLocation]);

  // Coupon State
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [isVerifyingCoupon, setIsVerifyingCoupon] = useState(false);
  const [couponStatus, setCouponStatus] = useState({ type: "", message: "" });

  const fetchPolicy = async (columnName, title) => {
    setModalTitle(title);
    setPolicyModalOpen(true);
    setLoadingPolicy(true);
    setModalContent("");

    try {
      const { data, error } = await supabase
        .from("app_policies")
        .select(columnName)
        .limit(1)
        .single();

      if (error) throw error;
      setModalContent(data?.[columnName] || "No content available.");
    } catch (err) {
      setModalContent(`Failed to load content. Error: ${err.message}`);
    } finally {
      setLoadingPolicy(false);
    }
  };

  const initDone = useRef(false);
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Even if no user, try to get background location for map biasing
        fetchCurrentLocation(true);
        return;
      }

      const { data } = await supabase
        .from("profile")
        .select("full_name,email,phone,address,pincode")
        .eq("id", user.id)
        .single();

      if (data) {
        setFirstName(data.full_name || "");
        setEmail(data.email || user.email || "");

        const rawPhone = data.phone || "";
        const cleanPhone = rawPhone.replace(/\D/g, "");
        const displayPhone = cleanPhone.length > 10 ? cleanPhone.slice(-10) : cleanPhone;

        setPhone(displayPhone);
        setProfilePhone(data.phone || "");
        setAddress(data.address || "");
        setZip(data.pincode || "");

        if (data.address) {
          setIsAddressSummaryMode(true);
          setHasUsedLocationFetch(true);

          // Background Geocoding of existing address to get coordinates for MapPicker default
          try {
            const query = data.address.includes(",") ? data.address : `${data.address}, Hyderabad`;
            const geocodeRes = await fetch(
              `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&accept-language=en`
            );
            const geocodeData = await geocodeRes.json();
            if (geocodeData && geocodeData.length > 0) {
              setLatitude(parseFloat(geocodeData[0].lat));
              setLongitude(parseFloat(geocodeData[0].lon));
            }
          } catch (e) {
            console.warn("Background geocoding failed:", e);
          }
        }
      }

      // Also trigger a background GPS fetch if we don't have coords yet
      fetchCurrentLocation(true);
    };
    init();
  }, [fetchCurrentLocation]);

  // Pincode serviceable check
  useEffect(() => {
    const checkPincode = async () => {
      if (!zip || zip.length !== 6) {
        setIsPincodeServiceable(false);
        return;
      }

      setIsCheckingPincode(true);
      try {
        const { data } = await supabase
          .from("neatify_service_areas")
          .select("id")
          .eq("pincode", zip.trim())
          .limit(1);

        setIsPincodeServiceable(!!(data && data.length > 0));
      } catch (err) {
        console.error("Pincode check error:", err);
        setIsPincodeServiceable(false);
      } finally {
        setIsCheckingPincode(false);
      }
    };

    checkPincode();
  }, [zip]);

  // ✅ Automatic Coupon Discovery
  useEffect(() => {
    const autoApplyCoupon = async () => {
      if (!phone || !profilePhone || appliedCoupon || isVerifyingCoupon || couponRemovedByUser) return;

      try {
        const cleanPhone = phone.replace(/\D/g, "").slice(-10);
        const cleanProfilePhone = profilePhone.replace(/\D/g, "").slice(-10);

        // Only look for coupons if the current phone matches the profile phone
        if (cleanPhone !== cleanProfilePhone) return;

        const { data } = await supabase
          .from("coupons")
          .select("*")
          .eq("phone_number", cleanPhone)
          .eq("is_used", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data) {
          setAppliedCoupon(data);
          setCouponInput(data.coupon_code);
          setCouponStatus({
            type: "success",
            message: `Coupon automatically applied! ${data.discount_percentage}% discount`
          });
        }
      } catch (err) {
        console.error("Auto-coupon discovery failed:", err);
      }
    };

    autoApplyCoupon();
  }, [phone, profilePhone, appliedCoupon, isVerifyingCoupon, couponRemovedByUser]);

  // Clear coupon if phone number doesn't match profile or is cleared
  useEffect(() => {
    if (profilePhone) {
      const cleanPhone = phone.replace(/\D/g, "").slice(-10);
      const cleanProfilePhone = profilePhone.replace(/\D/g, "").slice(-10);

      if ((!cleanPhone || cleanPhone !== cleanProfilePhone) && appliedCoupon) {
        setAppliedCoupon(null);
        setCouponInput("");
        setCouponStatus({ type: "", message: "" });
      }
    }
  }, [phone, profilePhone, appliedCoupon]);

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    // Keep couponInput as is (don't clear)
    setCouponStatus({ type: "", message: "Coupon disabled" });
    setCouponRemovedByUser(true);
  };

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) {
      setCouponStatus({ type: "error", message: "Please enter a coupon code" });
      return;
    }

    if (!phone) {
      setCouponStatus({ type: "error", message: "Please enter your phone number first" });
      return;
    }

    setIsVerifyingCoupon(true);
    setCouponStatus({ type: "", message: "" });
    setCouponRemovedByUser(false); // ✅ User is manually attempting to apply, so reset removal flag

    try {
      const cleanPhone = phone.replace(/\D/g, "").slice(-10);

      const { data, error } = await supabase
        .from("coupons")
        .select("*")
        .eq("coupon_code", couponInput.trim())
        .single();

      if (error || !data) {
        setCouponStatus({ type: "error", message: "Invalid coupon code" });
        setAppliedCoupon(null);
      } else if (data.is_used) {
        setCouponStatus({ type: "error", message: "This coupon has already been used" });
        setAppliedCoupon(null);
      } else if (data.phone_number.replace(/\D/g, "").slice(-10) !== cleanPhone) {
        setCouponStatus({ type: "error", message: "This coupon is not valid for your phone number" });
        setAppliedCoupon(null);
      } else {
        setAppliedCoupon(data);
        setCouponStatus({ type: "success", message: `Coupon applied! ${data.discount_percentage}% discount` });
      }
    } catch (err) {
      console.error("Coupon error:", err);
      setCouponStatus({ type: "error", message: "Error verifying coupon. Try again." });
    } finally {
      setIsVerifyingCoupon(false);
    }
  };

  /* ================= FETCH TAXES ================= */
  const [globalTaxRate, setGlobalTaxRate] = useState(0);

  useEffect(() => {
    const fetchTaxes = async () => {
      try {
        const { data, error } = await supabase
          .from("taxes")
          .select("percent")
          .eq("is_active", true);

        if (error) {
          console.error("Error fetching taxes:", error);
          return;
        }

        if (data && data.length > 0) {
          const totalPercent = data.reduce((sum, row) => {
            const val = parseFloat(row.percent);
            return sum + (isNaN(val) ? 0 : val);
          }, 0);
          setGlobalTaxRate(totalPercent);
        }
      } catch (err) {
        console.error("Tax fetch exception:", err);
      }
    };
    fetchTaxes();
  }, []);

  // Helper to safely parse price strings like "₹ 499.00" or numbers
  const parsePrice = (price) => {
    if (!price) return 0;
    const clean = String(price).replace(/[^\d.]/g, ""); // Keep digits and dot
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  const totalAmount = useMemo(() => {
    return selectedServices.reduce((sum, s) => {
      return sum + parsePrice(s.price);
    }, 0);
  }, [selectedServices]);

  const totalOriginalAmount = useMemo(() => {
    return selectedServices.reduce((sum, s) => {
      return sum + parsePrice(s.original_price);
    }, 0);
  }, [selectedServices]);

  const totalDurationMins = useMemo(() => {
    return selectedServices.reduce((sum, s) => {
      return sum + (parseDurationToMinutes(s.duration) * (s.quantity || 1));
    }, 0);
  }, [selectedServices]);

  const totalTax = useMemo(() => {
    // Use Global Tax fetched from 'taxes' table in Supabase
    if (globalTaxRate > 0) {
      return (totalAmount * globalTaxRate) / 100;
    }
    // Fallback: per-service 'tax_percent' column
    return selectedServices.reduce((sum, s) => {
      const price = parsePrice(s.price);
      const taxRate = parseFloat(s.tax_percent) || 0;
      return sum + (price * taxRate) / 100;
    }, 0);
  }, [selectedServices, totalAmount, globalTaxRate]);

  const finalSubtotal = totalAmount;
  const couponDiscount = useMemo(() => {
    if (!appliedCoupon) return 0;
    return (finalSubtotal * (parseFloat(appliedCoupon.discount_percentage) || 0)) / 100;
  }, [appliedCoupon, finalSubtotal]);

  const totalAmountAfterCoupon = finalSubtotal - couponDiscount;
  const finalTotalAmount = totalAmountAfterCoupon + totalTax;

  /* ================= PAYMENT + BOOKING ================= */

  const handlePlaceOrderAndPay = async () => {
    if (lockRef.current) return;
    lockRef.current = true;
    if (!firstName || !email || !phone || !address || !city || !zip) {
      const missing = [];
      if (!firstName) missing.push("First Name");
      if (!email) missing.push("Email");
      if (!phone) missing.push("Phone");
      if (!address) missing.push("Address");
      if (!city) missing.push("City");
      if (!zip) missing.push("Pincode");

      toast.warning(`Please fill all required fields: ${missing.join(", ")}`);
      lockRef.current = false;
      return;
    }

    if (phone.replace(/\D/g, "").length !== 10) {
      toast.warning("Phone number must be exactly 10 digits.");
      lockRef.current = false;
      return;
    }

    if (!isPincodeServiceable) {
      toast.error("Service Unavailable: Service is not available in your area yet. We are expanding soon!");
      lockRef.current = false;
      return;
    }

    if (!acceptPolicies || !agreeTerms) {
      toast.warning(
        "Please accept the User Policies & Terms & Conditions to proceed.",
      );
      lockRef.current = false;
      return;
    }

    if (isPaying) {
      lockRef.current = false;
      return;
    }
    setIsPaying(true);

    try {
      // ✅ AUTH CHECK (Moved to top)
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setIsPaying(false);
        lockRef.current = false;
        toast.error("Please login to proceed.");
        return;
      }

      /* ✅ BACKWARD SYNC (ALWAYS UPDATE FIRST) */

      const cleanPhone = phone.replace(/\D/g, "").slice(-10);
      const formattedPhone = `+91${cleanPhone}`;

      await supabase
        .from("profile")
        .update({
          full_name: firstName,
          phone: formattedPhone,
          address: address,
          pincode: zip,
          email: email,
        })
        .eq("id", user.id);

      await supabase
        .from("signup")
        .update({
          full_name: firstName,
          phone: formattedPhone,
          email: email,
        })
        .eq("id", user.id);

      await supabase.auth.updateUser({
        data: {
          display_name: firstName,
          full_name: firstName,
          phone_number: formattedPhone,
        },
      });

      /* 1️⃣ PINCODE CHECK */
      const { data: pincodeData } = await supabase
        .from("neatify_service_areas")
        .select("id")
        .eq("pincode", zip.trim())
        .limit(1);

      if (!pincodeData || pincodeData.length === 0) {
        setIsPaying(false);
        lockRef.current = false;
        setShowPincodeAlert(true);
        return;
      }

      /* 2️⃣ CREATE PENDING BOOKING */
      let formattedDate = "";
      if (year && month !== undefined && date) {
        formattedDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
      } else {
        formattedDate = new Date().toISOString().split("T")[0];
      }

      const bookingData = {
        user_id: user.id,
        customer_name: firstName,
        email: email,
        phone_number: formattedPhone,
        full_address: `${address}${city ? ', ' + city : ''}, ${zip}`,
        latitude: latitude,
        longitude: longitude,
        services: selectedServices,
        booking_date: formattedDate,
        booking_time: time || "Not specified",
        total_amount: Number(finalTotalAmount.toFixed(2)),
        payment_status: "pending", // Initial status
        payment_verified: false,
        payment_method: "razorpay",
        work_status: "PENDING",
        // ✅ Pre-fill coupon info in case payment fails or for immediate record
        coupon_code: appliedCoupon ? appliedCoupon.coupon_code : null,
        coupon_discount_percentage: appliedCoupon ? appliedCoupon.discount_percentage : 0,
        coupon_discount_amount: Number(couponDiscount.toFixed(2)),
      };

      const { data: bookingRow, error: bookingError } = await supabase
        .from("bookings")
        .insert([bookingData])
        .select()
        .single();

      if (bookingError || !bookingRow) {
        setIsPaying(false);
        lockRef.current = false;
        console.error("Booking creation failed:", bookingError);
        toast.error("Failed to create booking. Please try again.");
        return;
      }

      const bookingId = bookingRow.id;

      /* 3️⃣ PROCESS PAYMENT */
      const paymentResult = await processPayment(finalTotalAmount, {
        firstName,
        lastName: "",
        email,
        phone: formattedPhone,
      }, bookingId);

      if (!paymentResult.success) {
        setIsPaying(false);
        // Update booking to failed
        await supabase
          .from("bookings")
          .update({
            payment_status: "failed",
            work_status: "FAILED"
          })
          .eq("id", bookingId);

        if (paymentResult.error !== "DISMISSED") {
          setPaymentErrorMsg(paymentResult.error || "Unknown Error");
          setShowPaymentFailAlert(true);
        } else {
          // If the user just dismissed the Razorpay modal, still show them their bookings
          navigate("/my-bookings");
        }
        lockRef.current = false;
        return;
      }

      /* 4️⃣ SUCCESS - Store payment data temporarily (will save when user clicks OK) */
      setPendingBookingData({
        bookingId,
        paymentResult,
        appliedCoupon,
        couponDiscount
      });

      // ✅ Show success alert - user will click OK to confirm and save
      setShowSuccessAlert(true);

    } catch (err) {
      console.error("Order flow error:", err);
      setShowPaymentFailAlert(true);
    } finally {
      setIsPaying(false);
      lockRef.current = false;
    }
  };

  /* ================= UI ================= */

  return (
    <>
      <Helmet>
        <title>Payment | The Neatify Team | Cleaning Services in Hyderabad</title>
        <link rel="canonical" href="https://www.theneatifyteam.in/payment" />
      </Helmet>
      <Header user={user} />

      {isPaying && (
        <div style={overlayStyle}>
          <div
            style={{
              background: "#fff",
              padding: "24px 30px",
              borderRadius: "12px",
              fontWeight: "bold",
            }}
          >
            Processing Payment...
          </div>
        </div>
      )}

      {showPincodeAlert && (
        <Modal
          title="Service Unavailable"
          text="Service is not available in your area yet. We are expanding soon!"
          onClose={() => setShowPincodeAlert(false)}
        />
      )}

      {showPaymentFailAlert && (
        <Modal
          title="Payment Failed"
          text={paymentErrorMsg || "Payment was not successful. Please try again."}
          onClose={() => {
            setShowPaymentFailAlert(false);
            navigate("/my-bookings");
          }}
        />
      )}

      {criticalError && (
        <Modal
          title="⚠️ Booking Error"
          text={`PAYMENT SUCCESSFUL, BUT BOOKING FAILED. \n\nPayment ID: ${criticalError.paymentId} \n\nPlease take a screenshot and contact support immediately.`}
          onClose={() => setCriticalError(null)}
          isCritical={true}
        />
      )}

      {showSuccessAlert && (
        <Modal
          title="Booking Successful!"
          text="Your booking has been placed and payment verified. You can view it in My Bookings."
          onClose={async () => {
            if (successProcessingRef.current) return;
            successProcessingRef.current = true;

            console.log("✅ Success modal closed, pendingBookingData:", pendingBookingData);
            setShowSuccessAlert(false); // Hide immediately to prevent double clicks

            if (pendingBookingData) {
              const { appliedCoupon } = pendingBookingData;

              try {
                // Mark coupon as used
                if (appliedCoupon) {
                  const { error: couponError } = await supabase
                    .from("coupons")
                    .update({ is_used: true })
                    .eq("id", appliedCoupon.id);

                  if (couponError) {
                    console.error("❌ Coupon update failed:", couponError);
                  } else {
                    console.log("✅ Coupon marked as used:", appliedCoupon.coupon_code);
                  }
                }
                // MARKER: Manual email calls removed. 
                // Emails (Confirmation & Invoice) are handled by Supabase Edge Functions to prevent duplicates.
              } catch (err) {
                console.error("❌ Error in success handler:", err);
              }
            } else {
              console.warn("⚠️ pendingBookingData is null - booking may not be saved");
            }

            // Wait a moment for real-time sync before navigating
            setTimeout(() => {
              setPendingBookingData(null);
              navigate("/my-bookings");
            }, 1000);
          }}
        />
      )}

      {policyModalOpen && (
        <PolicyModal
          title={modalTitle}
          content={modalContent}
          loading={loadingPolicy}
          onClose={() => setPolicyModalOpen(false)}
        />
      )}

      <div className="payment-container">
        <button className="back-btn-circle" onClick={() => navigate(-1)} title="Back">
          <FiArrowLeft size={20} />
        </button>
        <div className="main-row">
          <div className="left">
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First Name *"
            />
            <input value={email} disabled />
            <div className="payment-phone-input-wrapper">
              <span className="payment-phone-prefix">+91</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  if (val.length <= 10) setPhone(val);
                }}
                placeholder="Phone Number *"
                className="payment-phone-input-with-prefix"
              />
            </div>

            <div className="address-section-wrapper">
              {isAddressSummaryMode && hasUsedLocationFetch ? (
                <div className="address-summary-card">
                  <div className="address-summary-header">
                    <span className="address-summary-title">SELECTED LOCATION</span>
                  </div>
                  <div className="address-summary-body">
                    <div
                      className="address-summary-icon-box"
                      onClick={() => setShowMapPicker(true)}
                      title="Adjust on Map"
                      style={{ cursor: "pointer" }}
                    >
                      <div className="address-summary-pin-circle">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" /></svg>
                      </div>
                    </div>
                    <div className="address-summary-details">
                      <p className="address-summary-text">
                        {address}{city ? `, ${city}` : ''}{zip ? ` - ${zip}` : ''}
                      </p>
                    </div>
                    <button
                      className="address-summary-edit-btn"
                      onClick={() => setIsAddressSummaryMode(false)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      <span>Edit</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="address-edit-box">
                  <label className="address-edit-label">Full Address (House No, Building, Area, City) *</label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. Plot no 1821, flat no 402, Sri sai nilayam, Pragathi nagar, Hyderabad"
                    className="address-edit-textarea"
                  />

                  <label className="address-edit-label">City *</label>
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Hyderabad"
                    className="address-edit-pincode"
                    style={{ marginBottom: "16px" }}
                  />

                  <label className="address-edit-label">
                    Pincode *
                    {hasUsedLocationFetch && (
                      <span className="pincode-verify-hint">⚠️ Please verify — GPS pincode may be inaccurate</span>
                    )}
                  </label>
                  <input
                    value={zip}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      if (val.length <= 6) setZip(val);
                    }}
                    placeholder="500090"
                    className={`address-edit-pincode${hasUsedLocationFetch ? " address-edit-pincode--verify" : ""}`}
                  />

                  {hasUsedLocationFetch && (
                    <button
                      className="address-done-btn"
                      onClick={() => setIsAddressSummaryMode(true)}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      Done Editing
                    </button>
                  )}
                </div>
              )}

              {zip.length === 6 && (
                <div className={`pincode-status-box ${isCheckingPincode ? 'checking' : isPincodeServiceable ? 'available' : 'unavailable'}`}>
                  <div className="pincode-status-icon">
                    {isCheckingPincode ? (
                      <svg className="spin-anim" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
                    ) : isPincodeServiceable ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="#10B981" stroke="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"></path></svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="#EF4444" stroke="none"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"></path></svg>
                    )}
                  </div>
                  <div className="pincode-status-text">
                    <strong>{isCheckingPincode ? 'Checking...' : isPincodeServiceable ? 'Service Available' : 'Service Not Available'}</strong>
                    <p>{isCheckingPincode ? 'Verifying your area' : isPincodeServiceable ? 'You can continue with booking.' : 'We will be available soon in your area.'}</p>
                  </div>
                </div>
              )}

              <div className="location-btn-row">
                <button
                  className="fetch-location-btn"
                  onClick={() => fetchCurrentLocation()}
                  disabled={isFetchingLocation}
                >
                  {isFetchingLocation
                    ? `Refining... ${locationAccuracy ? `(${Math.round(locationAccuracy)}m)` : ""}`
                    : "📍 Use My Location"}
                </button>
                <button
                  className="pick-on-map-btn"
                  onClick={() => setShowMapPicker(true)}
                >
                  🗺️ Pick on Map
                </button>
              </div>
              <p className="location-accuracy-note">
                For best accuracy on desktop, use <strong>Pick on Map</strong> to pin your exact location.
              </p>
            </div>

            {showMapPicker && (
              <MapPicker
                initialLat={latitude || 17.4399}
                initialLng={longitude || 78.4983}
                onConfirm={({ lat, lng, address: pickedAddr, zip: pickedZip, city: pickedCity }) => {
                  setLatitude(lat);
                  setLongitude(lng);
                  if (pickedAddr) setAddress(pickedAddr);
                  if (pickedZip) setZip(pickedZip);
                  if (pickedCity) setCity(pickedCity);
                  setHasUsedLocationFetch(true);
                  setIsAddressSummaryMode(true);
                  setShowMapPicker(false);
                  toast.success("Location pinned! Please verify your pincode below.");
                }}
                onClose={() => setShowMapPicker(false)}
              />
            )}

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Message (Optional)"
              className="message-textarea"
            />
          </div>

          <div className="right">
            <h3 className="section-title">Service Details</h3>

            <div className="services-wrapper">
              {selectedServices.map((s, i) => (
                <div key={i} className="service-item">
                  <strong className="service-item-title">{s.title || s.name}</strong>
                  <div className="service-item-price-row">
                    {s.original_price && (
                      <span className="mrp">
                        {getCurrency(s.original_price)}{formatPrice(s.original_price)}
                      </span>
                    )}
                    <span className="service-item-price">
                      {getCurrency(s.price)}{formatPrice(s.price)}
                    </span>
                    {(s.discount_percent > 0 || s.discount_label) && (
                      <span className="offer-badge">
                        {s.discount_label ||
                          (s.discount_percent > 0
                            ? `${s.discount_percent}% OFF`
                            : "SPECIAL OFFER")}
                      </span>
                    )}
                  </div>
                  <p className="service-item-duration">
                    {formatDuration(s.duration)}
                  </p>
                  <p className="service-item-date">
                    {date} {MONTHS[month]} {year} at {time}
                  </p>
                </div>
              ))}
            </div>

            <div className="summary-bottom">
              <div className="coupon-section">
                <h4 className="coupon-title">Have a coupon code?</h4>
                <div className="coupon-input-group">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="ENTER CODE"
                    className="coupon-input"
                    disabled={isVerifyingCoupon}
                  />
                  <button
                    className={appliedCoupon ? "coupon-remove-btn" : "coupon-apply-btn"}
                    onClick={appliedCoupon ? handleRemoveCoupon : handleApplyCoupon}
                    disabled={isVerifyingCoupon || (!appliedCoupon && !couponInput.trim())}
                  >
                    {isVerifyingCoupon ? "..." : (appliedCoupon ? "Remove" : "Apply")}
                  </button>
                </div>
                {couponStatus.message && (
                  <p className={`coupon-status ${couponStatus.type}`}>
                    {couponStatus.message}
                  </p>
                )}
              </div>
              <div className="total-row">
                <span>Total Duration</span>
                <strong>
                  {totalDurationMins} mins
                </strong>
              </div>

              <div className="total-row">
                <span>Subtotal</span>
                <strong>{currency}{totalAmount}</strong>
              </div>

              {appliedCoupon && (
                <div className="total-row coupon-row">
                  <span>Coupon Discount ({appliedCoupon.discount_percentage}%)</span>
                  <strong className="discount-value">-{currency}{couponDiscount.toFixed(2)}</strong>
                </div>
              )}

              <div className="total-row">
                <span>Tax (GST)</span>
                <strong>{currency}{totalTax.toFixed(2)}</strong>
              </div>

              <div className="total-row-premium">
                <span className="total-label">Total Amount</span>
                <div className="total-value-container">
                  {totalOriginalAmount > totalAmount && (
                    <span className="mrp-strikethrough">{currency}{totalOriginalAmount}</span>
                  )}
                  <strong className="total-price-value">{currency}{finalTotalAmount.toFixed(2)}</strong>
                  <div className="offer-badge-box">
                    {(selectedServices[0]?.discount_percent > 0 ||
                      selectedServices[0]?.discount_label) && (
                        <span className="offer-badge">
                          {(selectedServices[0].discount_label ||
                            (selectedServices[0].discount_percent > 0
                              ? `${selectedServices[0].discount_percent}% OFF`
                              : "SPECIAL OFFER")).toUpperCase()}
                        </span>
                      )}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "18px" }}>
                <label
                  style={{ display: "flex", gap: "10px", marginBottom: "8px" }}
                >
                  <input
                    type="checkbox"
                    checked={acceptPolicies}
                    onChange={(e) => setAcceptPolicies(e.target.checked)}
                  />
                  <span>
                    I accept the{" "}
                    <span
                      className="policy-link"
                      onClick={() =>
                        fetchPolicy("user_policies", "User Policies")
                      }
                    >
                      User Policies
                    </span>
                  </span>
                </label>

                <label style={{ display: "flex", gap: "10px" }}>
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                  />
                  <span>
                    I agree to the{" "}
                    <span
                      className="policy-link"
                      onClick={() =>
                        fetchPolicy(
                          "terms_and_conditions",
                          "Terms & Conditions",
                        )
                      }
                    >
                      Terms & Conditions
                    </span>
                  </span>
                </label>
              </div>

              <button
                className="primary-btn"
                onClick={handlePlaceOrderAndPay}
                disabled={!acceptPolicies || !agreeTerms || isPaying}
              >
                {isPaying ? "Processing Payment..." : "Place Order & Pay"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE STICKY FOOTER */}
      <div className="mobile-payment-footer">
        <div>
          <div className="footer-total">{currency}{finalTotalAmount.toFixed(2)}</div>
          {appliedCoupon && <div className="footer-discount">Saved {currency}{couponDiscount.toFixed(2)}</div>}
          <div className="footer-sub">Total Amount</div>
        </div>
        <button
          className="mobile-primary-btn"
          onClick={handlePlaceOrderAndPay}
          disabled={!acceptPolicies || !agreeTerms || isPaying}
        >
          {isPaying ? "Processing..." : "Pay Now"}
        </button>
      </div>
    </>
  );
}

/* ===== MODAL ===== */
function Modal({ title, text, onClose, isCritical }) {
  const [disabled, setDisabled] = useState(false);

  return (
    <div style={overlayStyle}>
      <div
        style={{ ...cardStyle, border: isCritical ? "2px solid red" : "none" }}
      >
        <h3 style={{ color: isCritical ? "red" : "black" }}>
          {title || "Confirm"}
        </h3>
        <p style={{ whiteSpace: "pre-wrap" }}>{text}</p>
        <button
          style={{ ...okBtnStyle, opacity: disabled ? 0.6 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
          disabled={disabled}
          onClick={() => {
            setDisabled(true);
            onClose();
          }}
        >
          {disabled ? "..." : "OK"}
        </button>
      </div>
    </div>
  );
}

/* ===== POLICY MODAL ===== */
function PolicyModal({ title, content, loading, onClose }) {

  return (
    <div className="policy-overlay">
      <div className="policy-modal">
        <div className="policy-header">
          <h2>{title}</h2>
          <button className="policy-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="policy-body">
          {loading ? (
            <p>Loading...</p>
          ) : (
            <div className="policy-content">
              {(() => {
                if (!content) return null;
                // Split content into points based on " - " or leading "- "
                const points = content
                  .split(/\s-\s|^-\s|^-/)
                  .map((p) => p.trim())
                  .filter(Boolean);

                if (points.length > 1) {
                  return (
                    <ul className="policy-list">
                      {points.map((point, idx) => (
                        <li key={idx}>{point}</li>
                      ))}
                    </ul>
                  );
                }
                // Fallback for non-bulleted content
                return <div dangerouslySetInnerHTML={{ __html: content }} />;
              })()}
            </div>
          )}
        </div>
        <div className="policy-footer">
          <button className="policy-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
};

const cardStyle = {
  background: "#fff",
  padding: "30px",
  borderRadius: "12px",
  width: "380px",
  textAlign: "center",
};

const okBtnStyle = {
  marginTop: "20px",
  padding: "10px 28px",
  background: "#f4c430",
  border: "none",
  borderRadius: "6px",
  fontWeight: "bold",
  cursor: "pointer",
};

/* ===== MAP PICKER ===== */
function MapPicker({ initialLat, initialLng, onConfirm, onClose }) {
  const toast = useToast();
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markerRef = useRef(null);
  const accuracyCircleRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickedData, setPickedData] = useState(null);
  const [mapMode, setMapMode] = useState("light"); // 'light' or 'satellite'
  const tileLayerRef = useRef(null);
  const lastRequestId = useRef(0);

  const reverseGeocode = useCallback(async (lat, lng, accuracy = null, customAddress = null) => {
    const requestId = ++lastRequestId.current;
    setPicking(true);
    setPickedData(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=en&zoom=18`
      );
      if (requestId !== lastRequestId.current) return;
      const data = await res.json();
      if (data && data.address) {
        const addr = data.address;
        const city = addr.city || addr.town || addr.village || addr.county || "";
        const zip = addr.postcode || "";
        const parts = [];
        if (addr.amenity) parts.push(addr.amenity);
        if (addr.office) parts.push(addr.office);
        if (addr.shop) parts.push(addr.shop);
        if (addr.tourism) parts.push(addr.tourism);
        if (addr.leisure) parts.push(addr.leisure);
        if (addr.building) parts.push(addr.building);
        if (addr.house_number) parts.push(addr.house_number);
        if (addr.road) parts.push(addr.road);
        if (addr.neighbourhood) parts.push(addr.neighbourhood);
        if (addr.residential) parts.push(addr.residential);
        if (addr.suburb) parts.push(addr.suburb);
        if (addr.city_district) parts.push(addr.city_district);
        if (city) parts.push(city);
        const fetchedAddress = formatTotalAddress(data, parts);

        let correctedZip = zip;
        const isPragathiNagar = fetchedAddress.toLowerCase().includes("pragathi nagar") ||
          (data.display_name && data.display_name.toLowerCase().includes("pragathi nagar"));

        if (isPragathiNagar && (zip === "501002" || !zip)) {
          correctedZip = "500090";
        }

        let finalAddress = fetchedAddress;
        if ((correctedZip === "500090" || correctedZip === "501002") && !finalAddress.toLowerCase().includes("hyderabad")) {
          finalAddress += ", Hyderabad";
        }

        // Prevent doubling
        // Use custom address if provided (from search), otherwise use geocoded one
        const displayAddress = customAddress || ((correctedZip && !finalAddress.includes(correctedZip))
          ? `${finalAddress} - ${correctedZip}`
          : finalAddress);

        // Detect if this is a specific building/amenity result
        const buildingName = addr.amenity || addr.office || addr.shop || addr.tourism || addr.leisure || addr.building;

        setPickedData({
          lat,
          lng,
          address: displayAddress,
          zip: correctedZip,
          city,
          accuracy,
          buildingName // Store building name to show snap option
        });
      }
    } catch (e) {
      console.error("Reverse geocode failed:", e);
    } finally {
      setPicking(false);
    }
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    let searchStatus = "";

    const performFetch = async (query, useViewbox = false) => {
      let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&accept-language=en`;

      if (useViewbox && leafletMapRef.current) {
        const bounds = leafletMapRef.current.getBounds();
        const viewbox = `${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()},${bounds.getSouth()}`;
        url += `&viewbox=${viewbox}&bounded=0`;
      }

      const res = await fetch(url);
      return await res.json();
    };

    const cleanQueryParts = (query) => {
      return query
        .replace(/,\s*Tel(?:angana)?\s*$/i, ", Telangana") // Normalize state
        .replace(/,\s*Tel\s*$/i, "") // Strip incomplete state
        .split(",")
        .map(p => p.trim())
        .filter(Boolean);
    };

    try {
      let queryParts = cleanQueryParts(searchQuery);
      let results = [];
      let usedQuery = searchQuery;

      // Recursive Strategy: Try dropping the first part of the address one by one
      while (queryParts.length > 0) {
        const currentQuery = queryParts.join(", ");

        // 1. Try with Local Bias
        results = await performFetch(currentQuery, true);
        if (results && results.length > 0) {
          usedQuery = currentQuery;
          if (usedQuery !== searchQuery) {
            searchStatus = `Showing general area for "${usedQuery}". Please adjust the pin to your exact spot.`;
          }
          break;
        }

        // 2. Try without Local Bias (Global fallback)
        results = await performFetch(currentQuery, false);
        if (results && results.length > 0) {
          usedQuery = currentQuery;
          if (usedQuery !== searchQuery) {
            searchStatus = `Showing general area for "${usedQuery}". Please adjust the pin.`;
          }
          break;
        }

        // 3. Keyword stripping for the current part if it's the last hope
        if (queryParts.length === 1) {
          const stripped = currentQuery
            .replace(/plot|flat|house|residency|apartment|building|villa|shop|no|dr\.|opposite|beside/gi, " ")
            .replace(/\s+/g, " ")
            .trim();
          if (stripped !== currentQuery) {
            results = await performFetch(stripped, true) || await performFetch(stripped, false);
            if (results && results.length > 0) {
              usedQuery = stripped;
              break;
            }
          }
        }

        // Drop the first part (usually the most specific/error-prone) and try again
        queryParts.shift();
      }

      if (results && results.length > 0) {
        const { lat, lon } = results[0];
        const newLat = parseFloat(lat);
        const newLng = parseFloat(lon);

        if (searchStatus) {
          toast.info(searchStatus, { duration: 6000 });
        }

        // Immediate feedback: Keep the ORIGINAL search query as the text,
        // but center the map on the best possible match result.
        setPickedData({
          lat: newLat,
          lng: newLng,
          address: searchQuery, // Keep what the user typed!
          zip: "",
          city: "",
          accuracy: null
        });

        if (leafletMapRef.current && markerRef.current) {
          const el = markerRef.current.getElement();
          if (el) {
            el.classList.remove('marker-bounce');
            void el.offsetWidth;
            el.classList.add('marker-bounce');
          }

          leafletMapRef.current.flyTo([newLat, newLng], 18, {
            duration: 1.5,
            easeLinearity: 0.25
          });
          markerRef.current.setLatLng([newLat, newLng]);
          reverseGeocode(newLat, newLng, null, searchQuery);
        }
      } else {
        alert("We couldn't find this spot. Try searching for a nearby landmark, colony name, or just the area name.");
      }
    } catch (error) {
      console.error("Search failed:", error);
      alert("Search service is temporarily unavailable. Please try manual pinning.");
    } finally {
      setIsSearching(false);
    }
  };

  const [isLeafletLoaded, setIsLeafletLoaded] = useState(!!window.L);
  const initRetryCount = useRef(0);

  useEffect(() => {
    // Self-healing: If Leaflet is missing, inject it manually
    if (!window.L) {
      console.log("Injecting Leaflet manually...");
      const script = document.createElement('script');
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js";
      script.async = true;
      script.onload = () => {
        setIsLeafletLoaded(true);
      };
      script.onerror = () => { };
      document.head.appendChild(script);

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css";
      document.head.appendChild(link);
    } else {
      setIsLeafletLoaded(true);
    }
  }, []);

  const locateMe = useCallback(() => {
    if (!navigator.geolocation) return;
    setPicking(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        if (leafletMapRef.current && markerRef.current) {
          // Centering map at zoom 18 as requested (Swiggy style)
          leafletMapRef.current.setView([lat, lng], 18);
          markerRef.current.setLatLng([lat, lng]);

          if (accuracyCircleRef.current) {
            leafletMapRef.current.removeLayer(accuracyCircleRef.current);
          }
          accuracyCircleRef.current = window.L.circle([lat, lng], {
            radius: accuracy,
            color: "#3b82f6",
            fillColor: "#3b82f6",
            fillOpacity: 0.15,
            weight: 2,
            dashArray: "5, 5"
          }).addTo(leafletMapRef.current);

          reverseGeocode(lat, lng, accuracy);
        }
        setPicking(false);
      },
      () => {
        setPicking(false);
        alert("Could not fetch device location. Please try manually pinning.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [reverseGeocode]);

  useEffect(() => {
    // Hard-Init Polling Logic: Retry until mapRef has height and L is available
    const initTimer = setInterval(() => {
      if (leafletMapRef.current) {
        clearInterval(initTimer);
        return;
      }

      const container = mapRef.current;
      if (!window.L || !container || container.offsetHeight < 50) {
        initRetryCount.current++;
        if (initRetryCount.current > 20) clearInterval(initTimer); // Give up after 10s
        return;
      }

      try {
        const map = window.L.map(container, {
          zoomControl: true,
          attributionControl: true,
          preferCanvas: true
        }).setView([initialLat, initialLng], 18);

        leafletMapRef.current = map;
        clearInterval(initTimer);

        // Initial Tile Layer - Standard OSM for higher detail (Street names, building names)
        const lightTiles = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
        const lightAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

        tileLayerRef.current = window.L.tileLayer(lightTiles, {
          attribution: lightAttribution,
          maxZoom: 19
        }).addTo(map);
        const icon = window.L.divIcon({
          className: "custom-marker",
          html: `<div class="marker-pin"></div><div class="marker-pulse"></div>`,
          iconSize: [30, 42],
          iconAnchor: [15, 42]
        });

        const marker = window.L.marker([initialLat, initialLng], { icon, draggable: true }).addTo(map);
        markerRef.current = marker;

        // Force redraw sequence
        const forceUpdate = () => {
          if (leafletMapRef.current) leafletMapRef.current.invalidateSize();
        };

        forceUpdate();
        setTimeout(forceUpdate, 100);
        setTimeout(forceUpdate, 500);
        setTimeout(forceUpdate, 1500);

        reverseGeocode(initialLat, initialLng);

        const isDefault = (Math.abs(initialLat - 17.4399) < 0.001 && Math.abs(initialLng - 78.4983) < 0.001);
        if (isDefault) locateMe();

        map.on("click", (e) => {
          marker.setLatLng(e.latlng);
          reverseGeocode(e.latlng.lat, e.latlng.lng);
        });

        marker.on("dragend", () => {
          const { lat, lng } = marker.getLatLng();
          reverseGeocode(lat, lng);
        });

      } catch (err) {
        clearInterval(initTimer);
      }
    }, 500);

    return () => {
      clearInterval(initTimer);
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [isLeafletLoaded, initialLat, initialLng, locateMe, reverseGeocode]);

  useEffect(() => {
    if (!leafletMapRef.current || !tileLayerRef.current) return;

    const layer = tileLayerRef.current;
    if (mapMode === "satellite") {
      layer.setUrl("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}");
      layer.options.attribution = 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EBP, and the GIS User Community';
    } else {
      layer.setUrl("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
      layer.options.attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    }
  }, [mapMode]);


  useEffect(() => {
    if (leafletMapRef.current) {
      leafletMapRef.current.invalidateSize();
    }
  }, [pickedData, picking, isSearching]);

  return (
    <div className="map-picker-overlay">
      <div className="map-picker-modal">
        <div className="map-picker-header">
          <div className="map-picker-header-content">
            <span className="map-picker-badge">📍</span>
            <div className="map-picker-texts">
              <span className="map-picker-title">Pin Your Location</span>
              <span className="map-picker-subtitle">Search for your area and drag the pin to your gate</span>
            </div>
          </div>
          <button className="map-picker-close-circle" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="map-search-container-premium">
          <form className="map-search-bar-modern" onSubmit={handleSearch}>
            <div className="search-input-wrapper-glass">
              <FiSearch size={16} className="search-icon-svg" />
              <input
                type="text"
                placeholder="Search building, apartment or area..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button type="button" className="search-clear-btn" onClick={() => setSearchQuery("")}>✕</button>
              )}
            </div>
            <button className="search-submit-btn-premium" type="submit" disabled={isSearching || !searchQuery.trim()}>
              {isSearching ? <div className="spinner-small"></div> : "Search"}
            </button>
          </form>
        </div>

        <div className="map-canvas-container-premium">
          <div
            ref={mapRef}
            className="map-picker-canvas-modern"
            style={{ height: '100%', width: '100%', display: 'block' }}
          />

          <div className="map-controls-floating">
            <button
              className={`map-layer-toggle ${mapMode === 'satellite' ? 'active' : ''}`}
              onClick={() => setMapMode(mapMode === 'light' ? 'satellite' : 'light')}
              title={mapMode === 'light' ? "Satellite View" : "Map View"}
            >
              {mapMode === 'light' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
              )}
            </button>
            <button className="map-locate-btn-premium" onClick={locateMe} title="Recenter to Me">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v2m0 16v2M2 12h2m16 0h2"></path></svg>
            </button>
          </div>

          <button
            type="button"
            className="map-refresh-floating-btn"
            onClick={() => {
              if (leafletMapRef.current) {
                leafletMapRef.current.invalidateSize();
                toast.success("Map refreshed!");
              } else {
                window.location.reload();
              }
            }}
          >
            <span>↻</span>
          </button>
        </div>

        <div style={{ flexShrink: 0 }}>
          {pickedData ? (
            <div className="map-picker-address-card">
              <div className="address-card-pin">📍</div>
              <div className="address-card-info">
                <p className="address-card-main">{pickedData.address || "Fetching address..."}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                  {pickedData.zip && <span className="address-card-sub">Pincode: {pickedData.zip}</span>}
                  {pickedData.accuracy && (
                    <span className={`address-card-sub accuracy-${pickedData.accuracy < 20 ? 'high' : pickedData.accuracy < 100 ? 'medium' : 'low'}`}>
                      Accuracy: {Math.round(pickedData.accuracy)}m
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="map-picker-address-card placeholder">
              <div className="spinner-small"></div>
              <p>Pinning location...</p>
            </div>
          )}

          {pickedData?.buildingName && (
            <div className="map-snap-suggestion">
              <span className="snap-icon">✨</span>
              <p>Found <strong>{pickedData.buildingName}</strong>. Want to snap the pin to its center?</p>
              <button
                className="snap-btn"
                onClick={async () => {
                  try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(pickedData.buildingName + ", " + pickedData.city)}&limit=1&accept-language=en`);
                    const data = await res.json();
                    if (data && data.length > 0) {
                      const nLat = parseFloat(data[0].lat);
                      const nLng = parseFloat(data[0].lon);
                      if (leafletMapRef.current && markerRef.current) {
                        leafletMapRef.current.flyTo([nLat, nLng], 18);
                        markerRef.current.setLatLng([nLat, nLng]);
                        reverseGeocode(nLat, nLng, pickedData.accuracy);
                        toast.success(`Snapped to ${pickedData.buildingName}!`);
                      }
                    }
                  } catch (e) {
                    toast.error("Could not snap to building.");
                  }
                }}
              >
                Snap Pin
              </button>
            </div>
          )}

          <div className="map-accuracy-premium-box">
            <span className="accuracy-label">💡 PRO TIP</span>
            <p>On desktop, drag the <strong>red pulse pin</strong> exactly to your house gate for 100% accuracy.</p>
          </div>

          <div className="map-picker-footer">
            <button className="map-picker-cancel" onClick={onClose}>Cancel</button>
            <button
              className="map-picker-confirm"
              disabled={!pickedData || picking}
              onClick={() => onConfirm(pickedData)}
            >
              {picking || isSearching ? "Wait..." : "Confirm Location"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}