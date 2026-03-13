/**
 * Utility to calculate the final display price for a service.
 * Priority: 
 * 1. Session-based "Claimed Offer" (specific to user session)
 * 2. Active Global Offer from 'offers' table (matching by title)
 * 3. Base Service data from 'services' table
 */
export const calculateServicePrice = (service, offersData = [], claimedOffer = null) => {
    if (!service) return null;

    // 1. Check for a session-claimed offer (highest priority for the current user)
    if (claimedOffer && claimedOffer.serviceId === service.id) {
        return {
            price: claimedOffer.offerPrice,
            discount_percent: claimedOffer.offerPercentage,
            discount_label: `${claimedOffer.offerPercentage}% OFF`,
            isClaimed: true
        };
    }

    // 2. Check for active global offers in Supabase
    const matchingOffer = (offersData || []).find(o => o.title === service.title);

    let finalPrice = service.price;
    let finalPct = parseFloat(service.discount_percent) || 0;
    let finalLabel = (service.discount_label ? service.discount_label.toUpperCase() : null) || (finalPct > 0 ? `${finalPct}% OFF` : null);

    if (matchingOffer) {
        const offerPrice = matchingOffer.offer_price !== undefined && matchingOffer.offer_price !== null ? matchingOffer.offer_price : matchingOffer.fixed_price;
        const offerPct = parseFloat(matchingOffer.offer_percentage) || 0;
        const originalPrice = service.original_price ? parseFloat(String(service.original_price).replace(/[^\d.]/g, "")) : null;

        if (offerPrice !== undefined && offerPrice !== null) {
            finalPrice = offerPrice;
        } else if (originalPrice && offerPct > 0) {
            finalPrice = Math.round(originalPrice * (1 - offerPct / 100));
        }

        finalPct = offerPct;
        finalLabel = offerPct > 0 ? `${offerPct}% OFF` : "SPECIAL OFFER";
    }

    return {
        price: finalPrice,
        discount_percent: finalPct,
        discount_label: finalLabel,
        isClaimed: false
    };
};
