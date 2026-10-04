import { createRemoteJWKSet, jwtVerify } from "jose";
import { getSupabase } from "./supabase.js";
import { failure } from "./response.js";

const REQUIRED_ISSUER_SUFFIX = "/auth/v1";

function getJwks(env) {
  if (!env.SUPABASE_URL) {
    throw new Error("SUPABASE_URL is missing");
  }

  const jwksUrl = new URL(
    "/auth/v1/.well-known/jwks.json",
    env.SUPABASE_URL
  );

  return createRemoteJWKSet(jwksUrl);
}

function getBearerToken(request) {
  const header = request.headers.get("Authorization");

  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

export async function authorizeRequest(
  env,
  request,
  requiredPermission
) {
  const token = getBearerToken(request);

  if (!token) {
    return {
      response: failure(
        "UNAUTHORIZED",
        "Authorization token is required",
        401
      )
    };
  }

  let payload;

  try {
    const issuer =
      `${env.SUPABASE_URL}${REQUIRED_ISSUER_SUFFIX}`;

    const verified = await jwtVerify(
      token,
      getJwks(env),
      {
        issuer,
        audience: "authenticated"
      }
    );

    payload = verified.payload;
  } catch (error) {
    console.error("JWT verification failed:", error);

    return {
      response: failure(
        "UNAUTHORIZED",
        "Invalid or expired authorization token",
        401
      )
    };
  }

  const userId = payload.sub;

    if (!userId) {
      return {
        response: failure(
          "UNAUTHORIZED",
          "Invalid user identity",
          401
        )
      };
    }

    const supabase = getSupabase(env);

    const { data: adminProfile, error: profileError } =
      await supabase
        .from("admin_profiles")
        .select("id, display_name, is_active")
        .eq("id", userId)
        .eq("is_active", true)
        .single();

    if (profileError || !adminProfile) {
      return {
        response: failure(
          "FORBIDDEN",
          "User is not an active FINDLY administrator",
          403
        )
      };
    }

    const { data: adminRoles, error: rolesError } =
      await supabase
        .from("admin_roles")
        .select("role_id")
        .eq("admin_id", userId);

    if (rolesError) {
      throw rolesError;
    }

    if (!adminRoles || adminRoles.length === 0) {
      return {
        response: failure(
          "FORBIDDEN",
          "Administrator has no assigned role",
          403
        )
      };
    }

    const roleIds = adminRoles.map(
      (item) => item.role_id
    );

    const { data: rolePermissions, error: permissionsError } =
      await supabase
        .from("role_permissions")
        .select("permission_id")
        .in("role_id", roleIds);

    if (permissionsError) {
      throw permissionsError;
    }

    const permissionIds =
      rolePermissions?.map(
        (item) => item.permission_id
      ) || [];

    if (permissionIds.length === 0) {
      return {
        response: failure(
          "FORBIDDEN",
          "Administrator has no permissions",
          403
        )
      };
    }

    const { data: permissions, error: permissionError } =
      await supabase
        .from("permissions")
        .select("code")
        .in("id", permissionIds);

    if (permissionError) {
      throw permissionError;
    }

    const allowed =
      permissions?.some(
        (permission) =>
          permission.code === requiredPermission
      );

    if (!allowed) {
      return {
        response: failure(
          "FORBIDDEN",
          "Required permission is missing",
          403
        )
      };
    }

    return {
      userId,
      adminProfile,
      permissions:
        permissions?.map(
          (permission) => permission.code
        ) || []
    };
  } catch (error) {
    console.error("JWT authorization failed:", error);

    return {
      response: failure(
        "UNAUTHORIZED",
        "Invalid or expired authorization token",
        401
      )
    };
  }
}
