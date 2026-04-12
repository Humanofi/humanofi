// ========================================
// Humanofi — Didit Identity: Verify & Generate HIUID
// ========================================
// POST /api/identity/verify
//
// Called after Didit verification completes (via polling/redirect).
// 1. Retrieves the session details from Didit API
// 2. Extracts identity data (name, DOB, country, document number)
// 3. Generates the HIUID (deterministic SHA-256 hash)
// 4. Checks uniqueness against Supabase
// 5. Returns the HIUID if unique, or rejects if already exists

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase/client";

const DIDIT_API_KEY = process.env.DIDIT_API_KEY;

// ─── HIUID Generation (inline from packages/hiuid) ───

function normalizeString(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\-]/g, "");
}

function hashDocumentNumber(docNumber: string): string {
  return createHash("sha256").update(docNumber.trim()).digest("hex");
}

function generateHIUID(
  firstName: string,
  lastName: string,
  dateOfBirth: string,
  countryCode: string,
  documentNumber: string
): string {
  const pepper = process.env.HIUID_SECRET_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new Error("HIUID_SECRET_PEPPER is required (min 32 chars)");
  }

  const fn = normalizeString(firstName);
  const ln = normalizeString(lastName);
  const dob = dateOfBirth.trim();
  const cc = countryCode.toUpperCase().trim();
  const docHash = hashDocumentNumber(documentNumber);

  const inputString = `${fn}|${ln}|${dob}|${cc}|${docHash}`;
  return createHash("sha256").update(inputString + pepper).digest("hex");
}

// ─── Route Handler ───

export async function POST(request: NextRequest) {
  if (!DIDIT_API_KEY) {
    return NextResponse.json({ error: "Didit not configured" }, { status: 503 });
  }

  try {
    const { sessionId, walletAddress } = await request.json();

    if (!sessionId || !walletAddress) {
      return NextResponse.json(
        { error: "sessionId and walletAddress are required" },
        { status: 400 }
      );
    }

    // 1. Retrieve the session from Didit V3 API
    const sessionResponse = await fetch(
      `https://verification.didit.me/v3/session/${sessionId}/decision/`,
      {
        headers: {
          "x-api-key": DIDIT_API_KEY,
        },
      }
    );

    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text();
      console.error("[Didit] Session retrieval failed:", errorText);
      return NextResponse.json(
        { error: "Failed to retrieve verification session" },
        { status: 500 }
      );
    }

    const session = await sessionResponse.json();

    // 2. Check if verification was successful
    if (session.status !== "Approved") {
      return NextResponse.json(
        {
          error: "Verification not approved",
          status: session.status,
        },
        { status: 400 }
      );
    }

    // 3. Extract verified identity data from Didit's decision object
    // Didit V3 returns id_verifications array in the decision
    const idVerification = session.id_verifications?.[0];

    if (!idVerification) {
      return NextResponse.json(
        { error: "No ID verification data found in session" },
        { status: 400 }
      );
    }

    const firstName = idVerification.first_name;
    const lastName = idVerification.last_name;
    const dateOfBirth = idVerification.date_of_birth; // "YYYY-MM-DD"
    const documentNumber = idVerification.document_number || idVerification.personal_number || sessionId;
    // Country from nationality (ISO 3166-1 alpha-3 → alpha-2 mapping)
    const rawCountry = idVerification.nationality || idVerification.issuing_state || "XX";
    const ALPHA3_TO_ALPHA2: Record<string, string> = {
      AFG:"AF",ALB:"AL",DZA:"DZ",AND:"AD",AGO:"AO",ARG:"AR",ARM:"AM",AUS:"AU",
      AUT:"AT",AZE:"AZ",BHS:"BS",BHR:"BH",BGD:"BD",BRB:"BB",BLR:"BY",BEL:"BE",
      BLZ:"BZ",BEN:"BJ",BTN:"BT",BOL:"BO",BIH:"BA",BWA:"BW",BRA:"BR",BRN:"BN",
      BGR:"BG",BFA:"BF",BDI:"BI",KHM:"KH",CMR:"CM",CAN:"CA",CPV:"CV",CAF:"CF",
      TCD:"TD",CHL:"CL",CHN:"CN",COL:"CO",COG:"CG",COD:"CD",CRI:"CR",HRV:"HR",
      CUB:"CU",CYP:"CY",CZE:"CZ",DNK:"DK",DJI:"DJ",DOM:"DO",ECU:"EC",EGY:"EG",
      SLV:"SV",GNQ:"GQ",ERI:"ER",EST:"EE",ETH:"ET",FIN:"FI",FRA:"FR",GAB:"GA",
      GMB:"GM",GEO:"GE",DEU:"DE",GHA:"GH",GRC:"GR",GTM:"GT",GIN:"GN",GUY:"GY",
      HTI:"HT",HND:"HN",HUN:"HU",ISL:"IS",IND:"IN",IDN:"ID",IRN:"IR",IRQ:"IQ",
      IRL:"IE",ISR:"IL",ITA:"IT",JAM:"JA",JPN:"JP",JOR:"JO",KAZ:"KZ",KEN:"KE",
      KWT:"KW",KGZ:"KG",LAO:"LA",LVA:"LV",LBN:"LB",LBR:"LR",LBY:"LY",LIE:"LI",
      LTU:"LT",LUX:"LU",MKD:"MK",MDG:"MG",MWI:"MW",MYS:"MY",MLI:"ML",MLT:"MT",
      MRT:"MR",MUS:"MU",MEX:"MX",MDA:"MD",MCO:"MC",MNG:"MN",MNE:"ME",MAR:"MA",
      MOZ:"MZ",MMR:"MM",NAM:"NA",NPL:"NP",NLD:"NL",NZL:"NZ",NIC:"NI",NER:"NE",
      NGA:"NG",NOR:"NO",OMN:"OM",PAK:"PK",PAN:"PA",PRY:"PY",PER:"PE",PHL:"PH",
      POL:"PL",PRT:"PT",QAT:"QA",ROU:"RO",RUS:"RU",RWA:"RW",SAU:"SA",SEN:"SN",
      SRB:"RS",SGP:"SG",SVK:"SK",SVN:"SI",SOM:"SO",ZAF:"ZA",KOR:"KR",ESP:"ES",
      LKA:"LK",SDN:"SD",SUR:"SR",SWE:"SE",CHE:"CH",SYR:"SY",TWN:"TW",TJK:"TJ",
      TZA:"TZ",THA:"TH",TGO:"TG",TTO:"TT",TUN:"TN",TUR:"TR",TKM:"TM",UGA:"UG",
      UKR:"UA",ARE:"AE",GBR:"GB",USA:"US",URY:"UY",UZB:"UZ",VEN:"VE",VNM:"VN",
      YEM:"YE",ZMB:"ZM",ZWE:"ZW",
    };
    const countryCode = rawCountry.length === 3
      ? (ALPHA3_TO_ALPHA2[rawCountry.toUpperCase()] || rawCountry.slice(0, 2))
      : rawCountry;

    if (!firstName || !lastName || !dateOfBirth) {
      return NextResponse.json(
        { error: "Incomplete identity data from Didit" },
        { status: 400 }
      );
    }

    // 4. Generate the HIUID
    const hiuid = generateHIUID(
      firstName,
      lastName,
      dateOfBirth,
      countryCode,
      documentNumber
    );

    // 5. Check uniqueness in Supabase
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Check if this HIUID already exists
    const { data: existing } = await supabase
      .from("verified_identities")
      .select("hiuid, has_token")
      .eq("hiuid", hiuid)
      .single();

    if (existing) {
      return NextResponse.json(
        {
          error: "A token already exists for this identity",
          code: "DUPLICATE_IDENTITY",
        },
        { status: 409 }
      );
    }

    // Check if this wallet already has a verified identity
    const { data: existingWallet } = await supabase
      .from("verified_identities")
      .select("hiuid")
      .eq("wallet_address", walletAddress)
      .single();

    if (existingWallet) {
      return NextResponse.json(
        {
          error: "This wallet already has a verified identity",
          code: "WALLET_ALREADY_VERIFIED",
        },
        { status: 409 }
      );
    }

    // 6. Store the verified identity
    const { error: insertError } = await supabase
      .from("verified_identities")
      .insert({
        hiuid,
        wallet_address: walletAddress,
        has_token: false,
        country_code: countryCode,
        didit_session_id: sessionId,
      });

    if (insertError) {
      console.error("Failed to store verified identity:", insertError);
      return NextResponse.json(
        { error: "Failed to store identity" },
        { status: 500 }
      );
    }

    // 7. Return the HIUID (the wallet can now create a token)
    return NextResponse.json({
      success: true,
      hiuid,
      countryCode,
      firstName,
      message: "Identity verified. You can now create your token.",
    });
  } catch (error) {
    console.error("Identity verification error:", error);
    return NextResponse.json(
      { error: "Internal verification error" },
      { status: 500 }
    );
  }
}
