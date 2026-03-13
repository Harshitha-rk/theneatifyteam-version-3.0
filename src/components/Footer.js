import React, { useEffect, useState, useCallback } from "react";
import {
  FiPhone,
  FiMail,
  FiMapPin,
  FiInstagram,
  FiFacebook,
} from "react-icons/fi";
import { FaWhatsapp } from "react-icons/fa";

import { supabase } from "./supabaseClient";
import "./Footer.css";

export default function Footer() {

  const [footerImage, setFooterImage] = useState(null);

  const fetchFooterImage = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("hero_images_footer")
        .select("image_path")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .limit(1)
        .single();

      if (error) {
        console.error("Error fetching footer image:", error.message);
        return;
      }

      if (data && data.image_path) {
        const { data: publicUrlData } = supabase.storage
          .from("hero-images-footer") // MUST match your bucket name exactly
          .getPublicUrl(data.image_path);

        if (publicUrlData && publicUrlData.publicUrl) {
          setFooterImage(publicUrlData.publicUrl);
        }
      }
    } catch (err) {
      console.error("Footer fetch exception:", err);
    }
  }, []);

  useEffect(() => {
    fetchFooterImage();
  }, [fetchFooterImage]);

  return (
    <footer className="footer" id="contact">
      <div className="footer-container">

        {/* LEFT */}
        <div className="footer-left">
          <h2 style={{ whiteSpace: "pre-line" }}>
            Ready for a cleaner, healthier home?
          </h2>
          <p>
            Experience the difference of a professional cleaning team. We take care of the details so you can enjoy your space.
          </p>
        </div>

        {/* CENTER */}
        <div className="footer-center">
          <h3>Contact Us</h3>

          <div className="contact-item">
            <FiPhone />
            <a
              href="https://wa.me/917617618567"
              target="_blank"
              rel="noreferrer"
            >
              +91 7617618567
            </a>
          </div>

          <div className="contact-item">
            <FiMail />
            <a href="mailto:info@theneatifyteam.in">
              info@theneatifyteam.in
            </a>
          </div>

          <div className="contact-item">
            <FiMapPin />
            <span>Hyderabad, Telangana</span>
          </div>

          {/* SOCIAL LINKS */}
          <div className="footer-social-inline">
            <span className="footer-social-inline-title">
              Social Links
            </span>

            <div className="footer-social-inline-icons">
              <a
                href="https://www.instagram.com/theneatifyteam/"
                target="_blank"
                rel="noreferrer"
              >
                <FiInstagram />
              </a>

              <a
                href="https://www.facebook.com/profile.php?id=61587541194874"
                target="_blank"
                rel="noreferrer"
              >
                <FiFacebook />
              </a>

              <a
                href="https://wa.me/917617618567"
                target="_blank"
                rel="noreferrer"
              >
                <FaWhatsapp />
              </a>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="footer-right">
          <div className="footer-logo-box">
            {footerImage ? (
              <img
                src={footerImage}
                alt="The Neatify Team Logo"
                className="footer-logo"
              />
            ) : (
              <p style={{ fontSize: "14px", opacity: 0.6 }}>
                Loading image...
              </p>
            )}
          </div>
        </div>

      </div>

      {/* BOTTOM BAR */}
      <div className="footer-bottom">
        <span>The Neatify Team™ - Professional Cleaning Services</span>
        <span>T&C Apply</span>
      </div>
    </footer>
  );
}