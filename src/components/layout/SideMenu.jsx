import React from 'react';
import { Layout, Menu, Button, Typography } from 'antd';
import { Link } from 'react-router-dom';
import {
    ReadOutlined,
    TeamOutlined,
    ShoppingCartOutlined,
    DollarCircleOutlined,
    RollbackOutlined,
    FileTextOutlined,
    LogoutOutlined,
    MenuFoldOutlined,   // Icon untuk menutup (collapse)
    MenuUnfoldOutlined, // Icon untuk membuka (expand)
} from '@ant-design/icons';

const { Sider } = Layout;
const { Text } = Typography;

// ============================
// Navigation Menu Component
// ============================
export const NavigationMenu = ({ activeKey, onLinkClick }) => (
    <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[activeKey]}
        onClick={onLinkClick}
        items={[
            // 1. DATA MASTER
            {
                key: '/buku',
                icon: <ReadOutlined />, 
                label: <Link to="/buku">Data Buku</Link>
            },
            {
                key: '/pelanggan',
                icon: <TeamOutlined />, 
                label: <Link to="/pelanggan">Data Customer</Link>
            },

            // 2. TRANSAKSI UTAMA
            {
                key: '/transaksi-jual',
                icon: <ShoppingCartOutlined />, 
                label: <Link to="/transaksi-jual">Transaksi Jual</Link>
            },

            // 3. KEUANGAN & PENYELESAIAN
            {
                key: '/pembayaran',
                icon: <DollarCircleOutlined />, 
                label: <Link to="/pembayaran">Pembayaran</Link>
            },
            {
                key: '/retur',
                icon: <RollbackOutlined />, 
                label: <Link to="/retur">Retur</Link>
            }, 
            {
                key: '/nonFaktur',
                icon: <FileTextOutlined />, 
                label: <Link to="/nonFaktur">Non Faktur</Link>
            },
        ]}
    />
);

// ============================
// Side Menu Component
// ============================
const SideMenu = ({ collapsed, onCollapse, activeKey, onLogout, userEmail }) => {
    return (
        <Sider
            collapsible
            collapsed={collapsed}
            onCollapse={onCollapse}
            trigger={null} // 1. HILANGKAN TRIGGER BAWAAN DI BAWAH
            width={240}
            style={{
                overflow: 'hidden',
                height: '100vh',
                position: 'fixed',
                left: 0,
                top: 0,
                bottom: 0,
                zIndex: 10,
            }}
        >
            {/* 2. Header Area (Logo + Toggle Button) */}
            <div
                style={{
                    height: '64px', // Sedikit dipertinggi agar pas dengan tombol
                    padding: '0 16px',
                    display: 'flex',
                    alignItems: 'center',
                    // Jika collapsed, pusatkan icon. Jika tidak, sebar (logo kiri, tombol kanan)
                    justifyContent: collapsed ? 'center' : 'space-between', 
                    background: '#002140', // Sedikit beda warna biar terlihat header
                }}
            >
                {/* Judul / Logo */}
                {!collapsed && (
                    <Text
                        style={{
                            color: 'white',
                            fontSize: '18px',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        CV Galatama
                    </Text>
                )}

                {/* Tombol Toggle Custom */}
                <Button
                    type="text"
                    icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                    onClick={() => onCollapse(!collapsed)}
                    style={{
                        fontSize: '16px',
                        width: 40,
                        height: 40,
                        color: 'white',
                        // Jika collapsed, margin auto biar centered otomatis oleh flex parent
                        marginLeft: collapsed ? 0 : 8, 
                    }}
                />
            </div>

            {/* 3. Scrollable Menu Area */}
            <div style={{ 
                height: 'calc(100vh - 64px - 100px)', // Sesuaikan tinggi (Header 64 + Footer ~100)
                overflowY: 'auto',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
            }}>
                <NavigationMenu activeKey={activeKey} onLinkClick={() => {}} />
            </div>

            {/* 4. Footer (User Info & Logout) */}
            <div
                style={{
                    position: 'absolute',
                    // 3. SET BOTTOM KE 0 KARENA TIDAK ADA TRIGGER BAWAAN
                    bottom: 0, 
                    
                    width: '100%',
                    padding: collapsed ? '10px 4px' : '16px',
                    borderTop: '1px solid #1f1f1f',
                    background: '#001529',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    zIndex: 11,
                }}
            >
                {/* Email User */}
                {!collapsed && userEmail && (
                    <Text
                        style={{
                            color: 'rgba(255, 255, 255, 0.65)',
                            marginBottom: '12px',
                            width: '100%',
                            textAlign: 'center',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: '13px'
                        }}
                        title={userEmail}
                    >
                        {userEmail}
                    </Text>
                )}

                {/* Tombol Logout */}
                <Button
                    type="default"
                    ghost 
                    icon={<LogoutOutlined />}
                    onClick={onLogout}
                    style={{
                        width: '100%',
                        color: 'rgba(255, 255, 255, 0.65)', 
                        borderColor: 'rgba(255, 255, 255, 0.3)', 
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                    title="Keluar"
                >
                    {!collapsed && 'Keluar'}
                </Button>
            </div>
        </Sider>
    );
};

export default SideMenu;