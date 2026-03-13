import React, { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import CategoryTabs from "../components/CategoryTabs";
import { supabase } from "./supabaseClient";


const getCurrency = (value) => {
  if (!value) return "₹"; // Fallback
  const match = String(value).match(/^([^\d\s]+)/);
  return match ? match[1] : "₹";
};

export default function Home() {
  const [services, setServices] = useState([]);
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    setLoading(true);

    const { data, error } = await supabase.from("services").select(`
      id,
      title,
      service_type,
      duration,
      price
    `);

    if (error) {
      console.error(error);
    } else {
      setServices(data || []);
    }

    setLoading(false);
  };

  const tabs = useMemo(() => {
    const uniqueTypes = Array.from(
      new Set(services.map((s) => s.service_type).filter(Boolean))
    );

    return [
      { label: "All Services", value: "ALL" },
      ...uniqueTypes.map((type) => ({
        label: type
          .toLowerCase()
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        value: type,
      })),
    ];
  }, [services]);

  const filteredServices = services.filter((service) => {
    const search = searchText.trim().toLowerCase();

    const matchesSearch =
      search.length === 0 ||
      service.title?.toLowerCase().includes(search) ||
      service.service_type?.toLowerCase().includes(search);

    const matchesCategory =
      activeCategory === "ALL" ||
      service.service_type?.toUpperCase() === activeCategory?.toUpperCase();

    return matchesSearch && matchesCategory;
  });

  return (
    <div
      style={{
        width: "100%",               // ✅ full width on mobile
        padding: "16px",
        maxWidth: "1200px",
        margin: "0 auto",
        boxSizing: "border-box",
      }}
    >

      {/* ✅ SEO */}
      <Helmet>
        <title>
          The Neatify Team | Cleaning Services in Hyderabad
        </title>
        <meta
          name="description"
          content="Book professional bathroom cleaning, kitchen cleaning and deep cleaning services in Hyderabad, Pragathi Nagar and Bachupally."
        />
        <link
          rel="canonical"
          href="https://www.theneatifyteam.in/"
        />
      </Helmet>

      <input
        placeholder="Search services"
        value={searchText}
        style={{
          width: "100%",               // ✅ full width input
          padding: "12px",
          fontSize: "16px",
          marginBottom: "15px",
          border: "1px solid #ddd",
          borderRadius: "6px",
          boxSizing: "border-box",
        }}
        onChange={(e) => {
          setSearchText(e.target.value);
          setActiveCategory("ALL");
        }}
      />

      <CategoryTabs
        activeTab={activeCategory}
        onChange={setActiveCategory}
        tabs={tabs}
      />

      {loading ? (
        <p>Loading...</p>
      ) : filteredServices.length === 0 ? (
        <p>No services found</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "16px",
            marginTop: "20px",
          }}
        >
          {filteredServices.map((s) => (
            <div
              key={s.id}
              style={{
                border: "1px solid #eee",
                padding: "16px",
                borderRadius: "8px",
                backgroundColor: "#ffffff",
                boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
              }}
            >
              <h4 style={{ marginBottom: "8px" }}>{s.title}</h4>
              <p style={{ margin: "4px 0" }}>{s.duration}</p>
              <p style={{ margin: "4px 0", fontWeight: "bold" }}>
                {getCurrency(s.price)}{String(s.price).replace(/^[^\d\s]+\s*/, "")}
              </p>
            </div>
          ))}
        </div>
      )}

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
