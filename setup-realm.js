// Automatic setup of 'fairenrol' realm, client, roles, and demo users on TideCloak (port 8081)
const BASE_URL = "http://localhost:8081";

async function main() {
  console.log("1. Authenticating as admin on TideCloak (port 8081)...");
  const authRes = await fetch(`${BASE_URL}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "admin-cli",
      grant_type: "password",
      username: "admin",
      password: "password",
    }),
  });

  if (!authRes.ok) {
    throw new Error(`Admin login failed: ${authRes.status} ${await authRes.text()}`);
  }

  const authData = await authRes.json();
  const token = authData.access_token;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // 2. Create Realm
  console.log("2. Creating realm 'fairenrol'...");
  const realmRes = await fetch(`${BASE_URL}/admin/realms`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: "fairenrol",
      realm: "fairenrol",
      displayName: "FairEnrol Course Registration",
      enabled: true,
      sslRequired: "none",
    }),
  });
  console.log(`Realm creation response: ${realmRes.status}`);

  // 3. Create Client 'fairenrol-app'
  console.log("3. Creating client 'fairenrol-app'...");
  const clientRes = await fetch(`${BASE_URL}/admin/realms/fairenrol/clients`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      clientId: "fairenrol-app",
      name: "FairEnrol Web App",
      enabled: true,
      publicClient: true,
      protocol: "openid-connect",
      standardFlowEnabled: true,
      implicitFlowEnabled: false,
      directAccessGrantsEnabled: true,
      redirectUris: ["http://localhost:5137/*", "http://localhost:5137/", "http://127.0.0.1:5137/*"],
      webOrigins: ["http://localhost:5137", "http://127.0.0.1:5137", "+"],
      attributes: {
        "pkce.code.challenge.method": "S256",
        "post.logout.redirect.uris": "http://localhost:5137/*##http://localhost:5137/",
      },
    }),
  });
  console.log(`Client creation response: ${clientRes.status}`);

  // 4. Create Roles
  console.log("4. Creating realm roles...");
  for (const role of ["student", "registrar", "approver"]) {
    const roleRes = await fetch(`${BASE_URL}/admin/realms/fairenrol/roles`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: role }),
    });
    console.log(`Role '${role}' creation: ${roleRes.status}`);
  }

  // 5. Create Users
  const users = [
    { username: "student1", firstName: "Avery", lastName: "Chen", email: "avery.chen@student.rmit.edu.vn", role: "student" },
    { username: "registrar1", firstName: "Taylor", lastName: "Reed", email: "taylor.reed@rmit.edu.vn", role: "registrar" },
    { username: "approver1", firstName: "Dr. Amara", lastName: "Okafor", email: "amara.okafor@rmit.edu.vn", role: "approver" },
  ];

  for (const u of users) {
    console.log(`5. Creating user '${u.username}'...`);
    const userRes = await fetch(`${BASE_URL}/admin/realms/fairenrol/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        enabled: true,
        emailVerified: true,
        credentials: [{ type: "password", value: "password", temporary: false }],
      }),
    });
    console.log(`User '${u.username}' creation: ${userRes.status}`);

    // Fetch user id to map role
    const getRes = await fetch(`${BASE_URL}/admin/realms/fairenrol/users?username=${u.username}`, { headers });
    const userList = await getRes.json();
    if (userList && userList.length > 0) {
      const userId = userList[0].id;
      const roleObjRes = await fetch(`${BASE_URL}/admin/realms/fairenrol/roles/${u.role}`, { headers });
      const roleObj = await roleObjRes.json();

      const assignRes = await fetch(`${BASE_URL}/admin/realms/fairenrol/users/${userId}/role-mappings/realm`, {
        method: "POST",
        headers,
        body: JSON.stringify([roleObj]),
      });
      console.log(`Assigned role '${u.role}' to '${u.username}': ${assignRes.status}`);
    }
  }

  console.log("\nALL SETUP FINISHED SUCCESSFULLY!");
}

main().catch((err) => {
  console.error("Setup error:", err);
  process.exit(1);
});
