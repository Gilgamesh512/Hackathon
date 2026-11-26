import { useState } from "react";
import { DEFAULT_TIDECLOAK_CONFIG, DOCKER_COMMAND } from "../services/tidecloak";

export default function TideCloakSetupModal({ isOpen, onClose, onReload, initError }) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const tideUrl = DEFAULT_TIDECLOAK_CONFIG.authServerUrl.replace(/\/$/, "");
  const tidePort = (() => {
    try {
      return new URL(tideUrl).port || "8081";
    } catch {
      return "8081";
    }
  })();
  const appOrigin = typeof window !== "undefined" ? window.location.origin : `http://localhost:${DEFAULT_TIDECLOAK_CONFIG.appPort}`;

  function copyDockerCommand() {
    navigator.clipboard.writeText(DOCKER_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="eyebrow">CONFIGURATION & TROUBLESHOOTING GUIDE</div>
            <h3>TideCloak Local IAM Integration</h3>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="setup-alert warning">
            <strong>⛔ TideCloak Server Not Running ({tideUrl} Refused Connection)</strong>
            <p>
              Trình duyệt chưa kết nối được tới TideCloak/Keycloak tại cổng <code>{tidePort}</code>.
              {initError?.message ? ` (${initError.message})` : ""}
            </p>
            <p style={{ marginTop: "6px" }}>
              💡 <strong>Lưu ý cho Ban giám khảo & Nhà phát triển:</strong> Nếu máy tính chưa cài Docker hoặc WSL 2, bạn hoàn toàn có thể nhấn nút <strong>"Tiếp tục với Chế độ Sandbox Demo"</strong> bên dưới để đánh giá 100% tính năng 2-of-3 Quorum, mã hóa W3C AES-GCM-256 và sổ cái SHA-256 Hash Chain mà không cần Docker!
            </p>
          </div>

          <div className="setup-steps">
            <div className="setup-step">
              <span className="step-num">1</span>
              <div className="step-content">
                <h4>Khởi chạy TideCloak Dev Container</h4>
                <p>Mở PowerShell và chạy lệnh sau (hoặc chạy <code>node setup-realm.js</code> sau khi container lên):</p>
                <div className="code-block-row">
                  <code>{DOCKER_COMMAND}</code>
                  <button className="button outline mini" onClick={copyDockerCommand}>
                    {copied ? "Đã copy!" : "Copy"}
                  </button>
                </div>
                <small style={{ color: "#77857e", display: "block", marginTop: "4px" }}>
                  * Yêu cầu Docker Desktop (WSL 2 trên Windows).
                </small>
              </div>
            </div>

            <div className="setup-step">
              <span className="step-num">2</span>
              <div className="step-content">
                <h4>Cấu hình Realm & Client trên Admin Console</h4>
                <p>
                  Chạy nhanh <code>node setup-realm.js</code> hoặc truy cập{" "}
                  <a href={`${tideUrl}/`} target="_blank" rel="noreferrer">{tideUrl}/</a> với tài khoản <code>admin / password</code>:
                </p>
                <ul>
                  <li>Tạo Realm tên: <strong>{DEFAULT_TIDECLOAK_CONFIG.realm}</strong></li>
                  <li>Tạo Client tên: <strong>{DEFAULT_TIDECLOAK_CONFIG.clientId}</strong> (OpenID Connect, Public client: ON, PKCE S256)</li>
                  <li>Cấu hình <strong>Valid redirect URIs</strong>: <code>{appOrigin}/*</code></li>
                  <li>Cấu hình <strong>Web origins</strong>: <code>{appOrigin}</code></li>
                </ul>
              </div>
            </div>

            <div className="setup-step">
              <span className="step-num">3</span>
              <div className="step-content">
                <h4>File Adapter Configuration</h4>
                <p>
                  File cấu hình <code>public/tidecloak.json</code> đã được tạo sẵn trong dự án với đầy đủ thông số cho realm <code>fairenrol</code>.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="button outline" onClick={onClose}>
            Tiếp tục với Chế độ Sandbox Demo (Không cần Docker)
          </button>
          <button className="button dark" onClick={onReload}>
            Kiểm tra lại kết nối (Reload)
          </button>
        </div>
      </div>
    </div>
  );
}
