import { supabase } from "../components/supabaseClient";

/* ================= CREATE ORDER ================= */
export const createOrder = async (amount, bookingId) => {
  try {
    const cleanAmount = parseFloat(amount);

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;

    const response = await fetch(`${process.env.REACT_APP_SUPABASE_URL}/functions/v1/create-razorpay-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token || process.env.REACT_APP_SUPABASE_ANON_KEY}`,
        "apikey": process.env.REACT_APP_SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        booking_id: bookingId,
        amount: cleanAmount,
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Edge Function Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    if (!data || !data.order_id) {
      throw new Error("INVALID_ORDER_RESPONSE");
    }

    return {
      id: data.order_id,
      amount: data.amount,
      currency: data.currency,
      key: data.key || process.env.REACT_APP_RAZORPAY_KEY,
    };
  } catch (err) {
    const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message;
    console.error("createOrder Error:", errorMsg);
    throw new Error(errorMsg);
  }
};

/* ================= VERIFY PAYMENT ================= */
export const verifyPayment = async (paymentDetails) => {
  try {
    const { data, error } = await supabase.functions.invoke("verify-payment", {
      body: {
        razorpay_order_id: paymentDetails.razorpay_order_id,
        razorpay_payment_id: paymentDetails.razorpay_payment_id,
        razorpay_signature: paymentDetails.razorpay_signature,
        booking_id: paymentDetails.booking_id,
      },
    });

    if (error || !data || data.success === false) {
      const errorMsg = error?.message || "VERIFICATION_FAILED";
      throw new Error(errorMsg);
    }

    return data;
  } catch (err) {
    console.error("verifyPayment Error:", err.message);
    throw err;
  }
};

/* ================= LOAD RAZORPAY SDK ================= */
const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

/* ================= PROCESS PAYMENT ================= */
export const processPayment = async (
  amount,
  userDetails = {},
  bookingId
) => {
  try {
    const loaded = await loadRazorpayScript();
    if (!loaded) {
      return { success: false, error: "SDK_LOAD_FAILED" };
    }

    const order = await createOrder(amount, bookingId);

    return new Promise((resolve) => {
      const options = {
        key: order.key,
        amount: order.amount,
        currency: "INR",
        name: "The Neatify Team",
        order_id: order.id,

        prefill: {
          name: `${userDetails.firstName || ""} ${userDetails.lastName || ""}`.trim(),
          email: userDetails.email || "",
          contact: userDetails.phone || "",
        },

        notes: {
          booking_id: bookingId,
        },

        handler: async (response) => {
          try {
            await verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              booking_id: bookingId,
            });

            resolve({
              success: true,
              paymentId: response.razorpay_payment_id,
              orderId: response.razorpay_order_id,
              signature: response.razorpay_signature,
            });
          } catch (err) {
            resolve({
              success: false,
              error: "VERIFICATION_FAILED",
            });
          }
        },

        modal: {
          ondismiss: () => {
            resolve({ success: false, error: "DISMISSED" });
          },
        },
      };

      const razorpay = new window.Razorpay(options);

      razorpay.on("payment.failed", (response) => {
        resolve({
          success: false,
          error: response.error?.description || "PAYMENT_FAILED",
        });
      });

      razorpay.open();
    });
  } catch (err) {
    console.error("Process payment error:", err);
    return { success: false, error: err.message || "PROCESS_PAYMENT_ERROR" };
  }
};
