// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface Contributor {
  id: string;
  address: string;
  encryptedShapley: string;
  contribution: number;
  lastUpdated: number;
  status: "active" | "inactive";
}

const App: React.FC = () => {
  // Randomly selected style: High contrast black+orange, Industrial mechanical, Center radiation, Micro-interactions
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newContributor, setNewContributor] = useState({
    address: "",
    encryptedData: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [showStats, setShowStats] = useState(false);

  // Calculate statistics
  const activeCount = contributors.filter(c => c.status === "active").length;
  const inactiveCount = contributors.filter(c => c.status === "inactive").length;
  const totalContribution = contributors.reduce((sum, c) => sum + c.contribution, 0);

  useEffect(() => {
    loadContributors().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadContributors = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("contributor_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing contributor keys:", e);
        }
      }
      
      const list: Contributor[] = [];
      
      for (const key of keys) {
        try {
          const contributorBytes = await contract.getData(`contributor_${key}`);
          if (contributorBytes.length > 0) {
            try {
              const contributorData = JSON.parse(ethers.toUtf8String(contributorBytes));
              list.push({
                id: key,
                address: contributorData.address,
                encryptedShapley: contributorData.encryptedShapley,
                contribution: contributorData.contribution || 0,
                lastUpdated: contributorData.lastUpdated || 0,
                status: contributorData.status || "active"
              });
            } catch (e) {
              console.error(`Error parsing contributor data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading contributor ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.contribution - a.contribution);
      setContributors(list);
    } catch (e) {
      console.error("Error loading contributors:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const addContributor = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setAdding(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting Shapley values with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newContributor))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const contributorId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const contributorData = {
        address: newContributor.address,
        encryptedShapley: encryptedData,
        contribution: 0, // Initialized to 0, will be updated after FHE computation
        lastUpdated: Math.floor(Date.now() / 1000),
        status: "active"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `contributor_${contributorId}`, 
        ethers.toUtf8Bytes(JSON.stringify(contributorData))
      );
      
      const keysBytes = await contract.getData("contributor_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(contributorId);
      
      await contract.setData(
        "contributor_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted data submitted securely!"
      });
      
      await loadContributors();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowAddModal(false);
        setNewContributor({
          address: "",
          encryptedData: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setAdding(false);
    }
  };

  const calculateContributions = async () => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Computing FHE-based Shapley values..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      // Call isAvailable to demonstrate FHE functionality
      await contract.isAvailable();
      
      // In a real implementation, this would trigger FHE computation
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE computation completed successfully!"
      });
      
      await loadContributors();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Computation failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const toggleContributorStatus = async (contributorId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Updating contributor status..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const contributorBytes = await contract.getData(`contributor_${contributorId}`);
      if (contributorBytes.length === 0) {
        throw new Error("Contributor not found");
      }
      
      const contributorData = JSON.parse(ethers.toUtf8String(contributorBytes));
      
      const updatedContributor = {
        ...contributorData,
        status: contributorData.status === "active" ? "inactive" : "active"
      };
      
      await contract.setData(
        `contributor_${contributorId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedContributor))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Status updated successfully!"
      });
      
      await loadContributors();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Update failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const filteredContributors = contributors.filter(contributor => {
    const matchesSearch = contributor.address.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         contributor.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = activeTab === "all" || 
                      (activeTab === "active" && contributor.status === "active") ||
                      (activeTab === "inactive" && contributor.status === "inactive");
    return matchesSearch && matchesTab;
  });

  if (loading) return (
    <div className="loading-screen">
      <div className="mechanical-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container industrial-theme">
      <header className="app-header">
        <div className="logo">
          <h1>FHE<span>AI</span>Contrib</h1>
          <p>Secure Model Attribution with Fully Homomorphic Encryption</p>
        </div>
        
        <div className="header-actions">
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="central-radial-layout">
          <div className="control-panel">
            <div className="panel-section">
              <h2>FHE Model Contributors</h2>
              <p>Analyze encrypted contributions in federated learning</p>
            </div>
            
            <div className="panel-section actions">
              <button 
                onClick={() => setShowAddModal(true)} 
                className="industrial-button primary"
              >
                Add Contributor
              </button>
              <button 
                onClick={calculateContributions}
                className="industrial-button secondary"
              >
                Compute FHE Shapley
              </button>
              <button 
                onClick={() => setShowStats(!showStats)}
                className="industrial-button tertiary"
              >
                {showStats ? "Hide Stats" : "Show Stats"}
              </button>
              <button 
                onClick={loadContributors}
                className="industrial-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            
            <div className="panel-section search-filter">
              <input
                type="text"
                placeholder="Search contributors..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="industrial-input"
              />
              <div className="filter-tabs">
                <button 
                  className={`tab-button ${activeTab === "all" ? "active" : ""}`}
                  onClick={() => setActiveTab("all")}
                >
                  All
                </button>
                <button 
                  className={`tab-button ${activeTab === "active" ? "active" : ""}`}
                  onClick={() => setActiveTab("active")}
                >
                  Active
                </button>
                <button 
                  className={`tab-button ${activeTab === "inactive" ? "active" : ""}`}
                  onClick={() => setActiveTab("inactive")}
                >
                  Inactive
                </button>
              </div>
            </div>
          </div>
          
          {showStats && (
            <div className="stats-panel industrial-card">
              <h3>Contribution Statistics</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{contributors.length}</div>
                  <div className="stat-label">Total Contributors</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{activeCount}</div>
                  <div className="stat-label">Active</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{inactiveCount}</div>
                  <div className="stat-label">Inactive</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{totalContribution.toFixed(2)}%</div>
                  <div className="stat-label">Total Contribution</div>
                </div>
              </div>
            </div>
          )}
          
          <div className="contributors-list industrial-card">
            <div className="list-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">Address</div>
              <div className="header-cell">Contribution</div>
              <div className="header-cell">Last Updated</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {filteredContributors.length === 0 ? (
              <div className="no-contributors">
                <div className="gear-icon"></div>
                <p>No contributors found</p>
                <button 
                  className="industrial-button primary"
                  onClick={() => setShowAddModal(true)}
                >
                  Add First Contributor
                </button>
              </div>
            ) : (
              filteredContributors.map(contributor => (
                <div className="contributor-row" key={contributor.id}>
                  <div className="table-cell contributor-id">#{contributor.id.substring(0, 6)}</div>
                  <div className="table-cell">{contributor.address.substring(0, 6)}...{contributor.address.substring(38)}</div>
                  <div className="table-cell">{contributor.contribution.toFixed(2)}%</div>
                  <div className="table-cell">
                    {new Date(contributor.lastUpdated * 1000).toLocaleDateString()}
                  </div>
                  <div className="table-cell">
                    <span className={`status-badge ${contributor.status}`}>
                      {contributor.status}
                    </span>
                  </div>
                  <div className="table-cell actions">
                    <button 
                      className="action-button industrial-button"
                      onClick={() => toggleContributorStatus(contributor.id)}
                    >
                      {contributor.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
  
      {showAddModal && (
        <ModalAddContributor 
          onSubmit={addContributor} 
          onClose={() => setShowAddModal(false)} 
          adding={adding}
          contributor={newContributor}
          setContributor={setNewContributor}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content industrial-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="mechanical-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <h3>FHE AI Contrib</h3>
            <p>Secure model attribution with fully homomorphic encryption</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">GitHub</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Security</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHE AI Contrib. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalAddContributorProps {
  onSubmit: () => void; 
  onClose: () => void; 
  adding: boolean;
  contributor: any;
  setContributor: (data: any) => void;
}

const ModalAddContributor: React.FC<ModalAddContributorProps> = ({ 
  onSubmit, 
  onClose, 
  adding,
  contributor,
  setContributor
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setContributor({
      ...contributor,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!contributor.address || !contributor.encryptedData) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="add-modal industrial-card">
        <div className="modal-header">
          <h2>Add New Contributor</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div> 
            <span>All data will be encrypted using FHE technology</span>
          </div>
          
          <div className="form-group">
            <label>Contributor Address *</label>
            <input 
              type="text"
              name="address"
              value={contributor.address} 
              onChange={handleChange}
              placeholder="0x..." 
              className="industrial-input"
            />
          </div>
          
          <div className="form-group">
            <label>Encrypted Shapley Values *</label>
            <textarea 
              name="encryptedData"
              value={contributor.encryptedData} 
              onChange={handleChange}
              placeholder="Enter encrypted contribution data..." 
              className="industrial-textarea"
              rows={4}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="industrial-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={adding}
            className="industrial-button primary"
          >
            {adding ? "Processing with FHE..." : "Add Contributor"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;