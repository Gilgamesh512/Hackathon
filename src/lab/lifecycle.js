// Target Lifecycle & State Controller
// Manages start, stop, reset, and health monitoring for registered targets.

import http from "node:http";
import { createCustomApiServer, resetState as resetCustomApiState } from "../../targets/custom-api/server.js";

export class TargetLifecycleManager {
  constructor(registry) {
    this.registry = registry;
    this.instances = new Map(); // targetId -> instance info
    this.activeServers = new Map(); // targetId -> running HTTP server instances
  }

  async getTargetStatus(targetId) {
    const target = this.registry.getTarget(targetId);
    if (!target) {
      throw new Error(`Target '${targetId}' is not registered in the approved catalog.`);
    }

    const instance = this.instances.get(targetId) || {
      targetId,
      status: "stopped",
      healthStatus: "offline",
      endpoint: null,
      lastCheck: new Date().toISOString(),
    };

    return instance;
  }

  async startTarget(targetId, port = 4100) {
    const target = this.registry.getTarget(targetId);
    if (!target) {
      throw new Error(`Scope Violation: Target '${targetId}' not in authorized registry.`);
    }

    if (this.instances.get(targetId)?.status === "running") {
      return this.instances.get(targetId);
    }

    if (target.id === "custom-api-vault") {
      // In-process isolated target runner
      const server = createCustomApiServer();
      await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
      this.activeServers.set(targetId, server);

      const endpoint = `http://127.0.0.1:${port}`;
      const instance = {
        targetId,
        status: "running",
        healthStatus: "healthy",
        endpoint,
        startedAt: new Date().toISOString(),
      };
      this.instances.set(targetId, instance);
      return instance;
    }

    // For containerized targets: simulate starting lifecycle state
    const defaultPort = target.runtime?.defaultPort || 3000;
    const endpoint = `http://127.0.0.1:${defaultPort}`;
    const instance = {
      targetId,
      status: "running",
      healthStatus: "ready",
      endpoint,
      startedAt: new Date().toISOString(),
    };
    this.instances.set(targetId, instance);
    return instance;
  }

  async stopTarget(targetId) {
    const target = this.registry.getTarget(targetId);
    if (!target) {
      throw new Error(`Target '${targetId}' is not registered.`);
    }

    if (this.activeServers.has(targetId)) {
      const server = this.activeServers.get(targetId);
      if (typeof server.closeAllConnections === "function") {
        server.closeAllConnections();
      }
      await new Promise((resolve) => server.close(resolve));
      this.activeServers.delete(targetId);
    }

    const instance = {
      targetId,
      status: "stopped",
      healthStatus: "offline",
      endpoint: null,
      stoppedAt: new Date().toISOString(),
    };
    this.instances.set(targetId, instance);
    return instance;
  }

  async resetTarget(targetId) {
    const target = this.registry.getTarget(targetId);
    if (!target) {
      throw new Error(`Target '${targetId}' is not registered.`);
    }

    if (target.id === "custom-api-vault") {
      resetCustomApiState();
      return {
        targetId,
        status: "reset_complete",
        strategy: target.lifecycle?.resetStrategy || "in-memory-seed",
        timestamp: new Date().toISOString(),
      };
    }

    return {
      targetId,
      status: "reset_acknowledged",
      strategy: target.lifecycle?.resetStrategy || "container-restart",
      timestamp: new Date().toISOString(),
    };
  }

  async checkHealth(targetId) {
    const instance = this.instances.get(targetId);
    if (!instance || instance.status !== "running" || !instance.endpoint) {
      return { healthy: false, status: "offline" };
    }

    try {
      const target = this.registry.getTarget(targetId);
      const healthPath = target?.lifecycle?.healthcheckEndpoint || "/";
      const res = await fetch(`${instance.endpoint}${healthPath}`, { method: "GET" });
      const healthy = res.ok;
      instance.healthStatus = healthy ? "healthy" : "degraded";
      return { healthy, status: instance.healthStatus, statusCode: res.status };
    } catch (err) {
      instance.healthStatus = "unreachable";
      return { healthy: false, status: "unreachable", error: err.message };
    }
  }
}
