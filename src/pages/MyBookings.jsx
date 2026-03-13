import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "../components/supabaseClient";
import { Helmet } from "react-helmet-async";
import Header from "../components/SampleHeader";
import { FiArrowLeft } from "react-icons/fi";
import "./MyBookings.css";

const getCurrency = (value) => {
  if (!value) return "₹"; // Fallback
  const match = String(value).match(/^([^\d\s]+)/);
  return match ? match[1] : "₹";
};

export default function MyBookings({ user }) {
  const navigate = useNavigate();

  const [bookings, setBookings] = useState([]);
  const [activeTab, setActiveTab] = useState("current");

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data } = await supabase
      .from("bookings")
      .select("*")
      .eq("user_id", user.id)
      // .eq("payment_status", "paid") // Removed to show failed bookings as well
      .order("created_at", { ascending: false });

    setBookings(data || []);
  };

  const normalizeStatus = (status) =>
    String(status || "").trim().toUpperCase();

  // Determine display status based on staff assignment and booking status
  const getDisplayStatus = (booking) => {
    const workStatus = normalizeStatus(booking.work_status);
    const refundStatus = normalizeStatus(booking.refund_status);
    const paymentStatus = normalizeStatus(booking.payment_status);

    // If refunded, show REFUNDED
    if (refundStatus === "REFUNDED") return "REFUNDED";

    // If cancelled, show CANCELLED
    if (workStatus === "CANCELLED") return "CANCELLED";

    // If payment explicitly failed, show PAYMENT FAILED
    if (paymentStatus === "FAILED") return "PAYMENT FAILED";

    // If completed, show COMPLETED
    if (workStatus === "COMPLETED") return "COMPLETED";

    // Check if staff is assigned
    if (booking.assigned_staff_email) return "ASSIGNED";

    // If paid (or even pending in creation stage), show PENDING unless it was a legacy failure
    if (paymentStatus === "PAID") return "PENDING";

    // Fallback for legacy data where payment failed but work_status was the primary indicator
    if (workStatus === "FAILED") return "PAYMENT FAILED";

    return "PENDING";
  };

  const currentBookings = bookings.filter((b) => {
    const status = getDisplayStatus(b);
    return ["ASSIGNED", "PENDING", "CANCELLED", "REFUNDED", "PAYMENT FAILED"].includes(status);
  });

  const completedBookings = bookings.filter((b) =>
    getDisplayStatus(b) === "COMPLETED"
  );

  const displayedBookings =
    activeTab === "current" ? currentBookings : completedBookings;

  return (
    <>
      <Helmet>
        <title>My Bookings | The Neatify Team | Cleaning Services in Hyderabad</title>
        <link rel="canonical" href="https://www.theneatifyteam.in/my-bookings" />
      </Helmet>
      <Header user={user} />

      <div className="my-bookings-container">
        <button className="back-btn" onClick={() => navigate("/services")}>
          <FiArrowLeft /> Back
        </button>

        <h1>My Bookings</h1>

        <div className="tabs">
          <button
            className={activeTab === "current" ? "active" : ""}
            onClick={() => setActiveTab("current")}
          >
            Current Bookings ({currentBookings.length})
          </button>

          <button
            className={activeTab === "completed" ? "active" : ""}
            onClick={() => setActiveTab("completed")}
          >
            Completed Bookings ({completedBookings.length})
          </button>
        </div>

        {displayedBookings.length === 0 ? (
          <p className="empty">No bookings found.</p>
        ) : (
          displayedBookings.map((b) => (
            <div key={b.id} className="booking-card">
              <div className="booking-header">
                <h3>{b.customer_name}</h3>

                <span className={`status ${getDisplayStatus(b)}`}>
                  {getDisplayStatus(b)}
                </span>
              </div>

              <p>
                {b.booking_date} at {b.booking_time}
              </p>

              <p>Total: {b.services && b.services[0] ? getCurrency(b.services[0].price) : "₹"}{b.total_amount}</p>

              <button
                className="view-btn"
                onClick={() => navigate(`/booking-details/${b.id}`)}
              >
                View
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}
