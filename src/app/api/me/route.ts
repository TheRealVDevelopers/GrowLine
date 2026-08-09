import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getUserById, updateUser } from "@/lib/users";
import { MAX_LEVEL_NAME } from "@/lib/targets";

export async function GET() {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const user = await getUserById(uid);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      photoUrl: user.photoUrl,
      city: user.city,
      referralCode: user.referralCode,
      plan: user.plan,
      trialEndsAt: user.trialEndsAt,
      createdAt: user.createdAt,
    },
  });
}

export async function PATCH(req: Request) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const data: {
    name?: string;
    city?: string;
    photoUrl?: string | null;
    levelName?: string | null;
  } = {};

  if (body?.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2 || name.length > 60) {
      return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
    }
    data.name = name;
  }
  if (body?.city !== undefined) {
    const city = String(body.city).trim();
    if (city.length < 2 || city.length > 60) {
      return NextResponse.json({ error: "Please enter your city." }, { status: 400 });
    }
    data.city = city;
  }
  if (body?.photoUrl !== undefined) {
    const raw = String(body.photoUrl ?? "");
    if (raw === "") data.photoUrl = null;
    else if (raw.startsWith("data:image/") && raw.length < 200_000) data.photoUrl = raw;
    else return NextResponse.json({ error: "That photo could not be used." }, { status: 400 });
  }

  if (body?.levelName !== undefined) {
    // The coach's own words for their level (F7). Stored verbatim and never
    // suggested by us — see Section 5.1 and LevelNameField.
    const raw = String(body.levelName ?? "").trim();
    if (raw.length > MAX_LEVEL_NAME) {
      return NextResponse.json({ error: "That name is too long." }, { status: 400 });
    }
    data.levelName = raw === "" ? null : raw;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  }

  const user = await updateUser(uid, data);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    ok: true,
    user: { name: user.name, city: user.city, levelName: user.levelName },
  });
}
