import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../components/supabaseClient";
import Header from "../components/SampleHeader";

import { FiArrowLeft } from "react-icons/fi";
import "./BookingDetails.css";

const getCurrency = (value) => {
  if (!value) return "₹"; // Fallback
  const match = String(value).match(/^([^\d\s]+)/);
  return match ? match[1] : "₹";
};

export default function CompletedBookings() {
  const { id } = useParams();
  const navigate = useNavigate();


  const [booking, setBooking] = useState(null);
  const [staffName, setStaffName] = useState("");
  const [review, setReview] = useState(null); // ✅ NEW
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBookingDetails = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (data) {
        setBooking(data);

        // ✅ FETCH REVIEW
        const { data: reviewData } = await supabase
          .from("reviews")
          .select("*")
          .eq("booking_id", data.id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (reviewData) {
          setReview(reviewData);
        }

        if (data.assigned_staff_email) {
          const { data: staff } = await supabase
            .from("staff_profile")
            .select("full_name")
            .eq("email", data.assigned_staff_email)
            .single();

          if (staff?.full_name) setStaffName(staff.full_name);
        }
      }

      setLoading(false);
    };

    fetchBookingDetails();
  }, [id]);

  if (loading) return <p className="loading">Loading booking...</p>;
  if (!booking) return <p className="empty">Booking not found</p>;

  const finalPaymentStatus = "PAID";

  let services = [];
  if (Array.isArray(booking.services)) services = booking.services;
  else if (typeof booking.services === "string") {
    try {
      services = JSON.parse(booking.services);
    } catch { }
  }

  return (
    <>
      <Header />
      <div className="booking-details-container">
        <button className="back-btn-top" onClick={() => navigate("/my-bookings")}>
          <FiArrowLeft /> Back
        </button>

        <h2 className="title">Completed Booking</h2>

        <p className="section">Customer Details</p>
        <div className="card">
          <p className="bold">{booking.customer_name}</p>
          <p>{booking.email}</p>
          <p>{booking.phone_number}</p>
        </div>

        <p className="section">Service Address</p>
        <div className="card">
          <p>{booking.full_address}</p>
        </div>

        <p className="section">Services</p>
        <div className="card">
          {services.map((s, i) => (
            <div key={i} className="service-row">
              <div>
                <p className="bold">{s.title || s.name}</p>
                <p>{s.duration}</p>
              </div>
              <p>{s.price}</p>
            </div>
          ))}
        </div>

        <p className="section">Schedule</p>
        <div className="card">
          <p>
            {booking.booking_date} at {booking.booking_time}
          </p>
        </div>

        <p className="section">Staff</p>
        <div className="card">
          <p className="bold">✓ Completed</p>
          <p>Staff Name: {staffName || "N/A"}</p>
          <p>Staff Email: {booking.assigned_staff_email}</p>
        </div>

        <p className="section">Payment</p>
        <div className="card">
          <div className="row">
            <p className="bold">Total</p>
            <p className="bold">{services && services[0] ? getCurrency(services[0].price) : "₹"}{booking.total_amount}</p>
          </div>
          <div className="status-container-centered">
            <p className="status-pill status-completed">
              Status: {finalPaymentStatus}
            </p>
          </div>
        </div>

        {/* ✅ REVIEW SECTION ADDED */}
        {review && (
          <>
            <p className="section">Your Feedback</p>
            <div className="card">
              <div style={{ fontSize: "20px", marginBottom: "8px" }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <span
                    key={star}
                    style={{
                      color:
                        star <= review.rating ? "#ffc107" : "#ccc",
                    }}
                  >
                    ★
                  </span>
                ))}
              </div>

              <p>{review.comment}</p>

              <button
                className="back-btn"
                style={{ marginTop: "10px" }}
                onClick={() =>
                  navigate(`/booking-details/${booking.id}`)
                }
              >
                Edit Feedback
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
