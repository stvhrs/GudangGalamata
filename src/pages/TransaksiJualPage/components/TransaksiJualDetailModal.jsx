import React, { useState, useEffect } from 'react';
import { Modal, Descriptions, Table, Typography, Tag, Timeline, Empty, Button, Divider, Spin, Row, Col, Statistic } from 'antd';
import { db } from '../../../api/firebase'; 
import { ref, query, orderByChild, equalTo, onValue } from "firebase/database";
import { 
    CheckCircleOutlined, 
    SyncOutlined, 
    ExclamationCircleOutlined,
    ArrowLeftOutlined,
    ArrowRightOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;

// --- Helper Format ---
const formatCurrency = (value) =>
    new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(value || 0);

const formatDate = (timestamp) =>
    new Date(timestamp || 0).toLocaleDateString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric'
    });

const formatTimestamp = (timestamp) => {
    if (!timestamp) return '...';
    return new Date(timestamp).toLocaleString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
};

// --- Kolom Tabel Item (Disesuaikan dengan field invoice_items) ---
const itemColumns = [
    { 
        title: 'Nama Buku', 
        dataIndex: 'judul', // Field 'judul' dari invoice_items
        key: 'judul',
        render: (text) => <Text strong>{text || '-'}</Text>
    }, 
    { 
        title: 'Qty', 
        dataIndex: 'qty', // Field 'qty' dari invoice_items
        key: 'qty', 
        align: 'center', 
        width: 80 
    },
    { 
        title: 'Harga', 
        dataIndex: 'harga', // Field 'harga' dari invoice_items
        key: 'harga', 
        align: 'right', 
        render: (val) => formatCurrency(val) 
    },
    { 
        title: 'Disc', 
        dataIndex: 'diskonPersen', 
        key: 'diskonPersen', 
        align: 'center', 
        render: (val) => `${val || 0}%`, 
        width: 80 
    },
    { 
        title: 'Subtotal', 
        dataIndex: 'subtotal', // Field 'subtotal' dari invoice_items
        key: 'subtotal', 
        align: 'right',
        render: (val, record) => {
            // Gunakan field subtotal langsung jika ada, atau hitung manual sebagai fallback
            if (val !== undefined && val !== null) return <Text strong>{formatCurrency(val)}</Text>;
            
            const hrg = Number(record.harga || 0);
            const qty = Number(record.qty || 0);
            const dsc = Number(record.diskonPersen || 0);
            const calc = qty * (hrg * (1 - dsc / 100));
            return <Text strong>{formatCurrency(calc)}</Text>;
        }
    }
];

const TransaksiJualDetailModal = ({ open, onCancel, transaksi }) => {
    const [timelineData, setTimelineData] = useState([]);
    const [fetchedItems, setFetchedItems] = useState([]); // State untuk menampung invoice_items
    const [loadingData, setLoadingData] = useState(false);

    // --- FETCH DATA (ITEMS, PAYMENTS, RETURNS) ---
    useEffect(() => {
        if (open && transaksi?.id) {
            setLoadingData(true);
            const invoiceId = transaksi.id;

            // 1. Fetch Item Buku dari 'invoice_items'
            const itemsRef = query(ref(db, 'invoice_items'), orderByChild('invoiceId'), equalTo(invoiceId));

            // 2. Fetch Payments dari 'payment_allocations'
            const allocRef = query(ref(db, 'payment_allocations'), orderByChild('invoiceId'), equalTo(invoiceId));
            
            // 3. Fetch Returns dari 'returns'
            const returnsRef = query(ref(db, 'returns'), orderByChild('invoiceId'), equalTo(invoiceId));

            // --- Listener Items ---
            const unsubscribeItems = onValue(itemsRef, (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    // Convert object ke array
                    const itemsArray = Object.values(data);
                    setFetchedItems(itemsArray);
                } else {
                    setFetchedItems([]);
                }
            });

            // --- Listener Payments & Returns (Timeline) ---
            let allocData = [];
            let returnsData = [];

            const unsubscribeAlloc = onValue(allocRef, (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    allocData = Object.keys(data).map(key => ({
                        id: key,
                        type: 'PAYMENT',
                        nominal: data[key].amount,
                        date: data[key].createdAt,
                        refId: data[key].paymentId,
                        ...data[key]
                    }));
                } else {
                    allocData = [];
                }
                mergeAndSetTimeline(allocData, returnsData);
            });

            const unsubscribeRet = onValue(returnsRef, (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    returnsData = Object.keys(data).map(key => ({
                        id: key,
                        type: 'RETURN',
                        nominal: data[key].totalRetur || data[key].totalBayar || 0, 
                        date: data[key].createdAt || data[key].tanggal,
                        ...data[key]
                    }));
                } else {
                    returnsData = [];
                }
                mergeAndSetTimeline(allocData, returnsData);
            });

            return () => {
                unsubscribeItems();
                unsubscribeAlloc();
                unsubscribeRet();
            };
        } else {
            setFetchedItems([]);
            setTimelineData([]);
        }
    }, [open, transaksi]);

    const mergeAndSetTimeline = (allocations, returns) => {
        const combined = [...allocations, ...returns];
        combined.sort((a, b) => (b.date || 0) - (a.date || 0));
        setTimelineData(combined);
        setLoadingData(false);
    };
    
    if (!transaksi) return null;

    // --- Destructure Data Header Invoice ---
    const {
        id: nomorInvoice,
        tanggal,
        namaCustomer,
        statusPembayaran,
        // items dari props tidak dipakai lagi untuk tabel, diganti fetchedItems
        
        totalBruto = 0,
        totalDiskon = 0,
        totalBiayaLain = 0,
        totalNetto = 0, 
        totalRetur = 0,
        totalBayar = 0
    } = transaksi;

    const sisaTagihan = (totalNetto - totalRetur) - totalBayar;

    const getStatusInfo = (status) => {
        if (status === 'LUNAS') return { color: 'green', icon: <CheckCircleOutlined /> };
        if (status === 'BELUM') return { color: 'red', icon: <ExclamationCircleOutlined /> };
        return { color: 'orange', icon: <SyncOutlined spin /> };
    };

    const { color: statusColor, icon: statusIcon } = getStatusInfo(statusPembayaran);

    return (
        <Modal
            open={open} onCancel={onCancel} centered 
            footer={[<Button key="close" onClick={onCancel}>Tutup</Button>]}
            title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginRight: 24 }}>
                    <span>Detail Invoice: {nomorInvoice}</span>
                    <Tag icon={statusIcon} color={statusColor} style={{ fontSize: 14, padding: '4px 10px' }}>
                        {statusPembayaran}
                    </Tag>
                </div>
            }
            width={900}
        >
            {/* --- INFO PELANGGAN & TANGGAL --- */}
            <Descriptions size="small" bordered column={{ xs: 1, sm: 2 }} style={{ marginBottom: 20 }}>
                <Descriptions.Item label="Pelanggan">
                    <Text strong>{namaCustomer}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Tanggal Transaksi">
                    {formatDate(tanggal)}
                </Descriptions.Item>
                <Descriptions.Item label="Keterangan" span={2}>
                    {transaksi.keterangan || '-'}
                </Descriptions.Item>
            </Descriptions>

            {/* --- RINGKASAN KEUANGAN --- */}
            <div style={{ background: '#f5f7fa', padding: 16, borderRadius: 8, marginBottom: 24, border: '1px solid #d9d9d9' }}>
                <Row gutter={[16, 16]}>
                    <Col xs={12} md={4}>
                        <Statistic title="Total Bruto" value={totalBruto} formatter={formatCurrency} valueStyle={{ fontSize: 16 }} />
                    </Col>
                    <Col xs={12} md={4}>
                        <Statistic title="Total Diskon" value={totalDiskon} formatter={formatCurrency} valueStyle={{ fontSize: 16, color: '#cf1322' }} prefix="-" />
                    </Col>
                    <Col xs={12} md={4}>
                        <Statistic title="Biaya Lain" value={totalBiayaLain} formatter={formatCurrency} valueStyle={{ fontSize: 16 }} />
                    </Col>
                    <Col xs={12} md={4}>
                        <Statistic title="Netto (Tagihan)" value={totalNetto} formatter={formatCurrency} valueStyle={{ fontSize: 16, fontWeight: 'bold', color: '#1890ff' }} />
                    </Col>
                    <Col xs={12} md={4}>
                        <Statistic title="Retur Barang" value={totalRetur} formatter={formatCurrency} valueStyle={{ fontSize: 16, color: '#cf1322' }} prefix="-" />
                    </Col>
                    <Col xs={12} md={4}>
                        <div style={{ background: '#fff', padding: '4px 8px', borderRadius: 4, border: '1px solid #f0f0f0' }}>
                            <Statistic title="Total Bayar" value={totalBayar} formatter={formatCurrency} valueStyle={{ fontSize: 16, color: '#3f8600' }} />
                        </div>
                    </Col>
                </Row>
                <Divider style={{ margin: '12px 0' }} />
                <Row justify="end">
                    <Col>
                         <Text type="secondary" style={{ marginRight: 8 }}>Sisa Kewajiban:</Text>
                         <Text strong style={{ fontSize: 18, color: sisaTagihan > 0 ? '#cf1322' : '#3f8600' }}>
                            {formatCurrency(sisaTagihan)}
                         </Text>
                    </Col>
                </Row>
            </div>

            {/* --- TABEL ITEM (DATA DARI INVOICE_ITEMS) --- */}
            <Title level={5}>Daftar Buku</Title>
            <Table
                columns={itemColumns} 
                dataSource={fetchedItems} // Menggunakan data hasil fetch
                rowKey={(r) => r.id} 
                pagination={false}
                bordered size="small" scroll={{ x: 600 }}
                style={{ marginBottom: 24 }}
                loading={loadingData && fetchedItems.length === 0}
                locale={{ emptyText: 'Tidak ada item buku' }}
            />

            {/* --- TIMELINE RIWAYAT --- */}
            <Title level={5}>Riwayat Pembayaran & Retur</Title>
            <div style={{ maxHeight: 300, overflowY: 'auto', padding: '16px 16px 0 16px', border: '1px solid #f0f0f0', borderRadius: 8 }}>
                {loadingData && timelineData.length === 0 ? <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div> : (
                    timelineData.length > 0 ? (
                        <Timeline>
                            {timelineData.map((item) => {
                                const isRetur = item.type === 'RETURN';
                                const color = isRetur ? 'red' : 'green';
                                const icon = isRetur ? <ArrowLeftOutlined /> : <ArrowRightOutlined />;
                                const sign = isRetur ? '-' : '+';
                                const nominal = item.nominal || 0;

                                return (
                                    <Timeline.Item key={item.id} color={color} dot={icon}>
                                        <Row justify="space-between" align="middle">
                                            <Col>
                                                <Text strong style={{ color: isRetur ? '#cf1322' : '#3f8600', fontSize: 15 }}>
                                                    {sign} {formatCurrency(nominal)}
                                                </Text>
                                                <div style={{ fontSize: 12, color: '#666' }}>
                                                    {isRetur ? 'RETUR BARANG' : 'ALOKASI PEMBAYARAN'}
                                                </div>
                                                {!isRetur && item.refId && (
                                                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                                                        Ref Payment: {item.refId}
                                                    </div>
                                                )}
                                                {isRetur && (
                                                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                                                        Ref Return: {item.id}
                                                    </div>
                                                )}
                                            </Col>
                                            <Col style={{ textAlign: 'right' }}>
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                    {formatTimestamp(item.date)}
                                                </Text>
                                            </Col>
                                        </Row>
                                    </Timeline.Item>
                                );
                            })}
                        </Timeline>
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Belum ada riwayat pembayaran atau retur" />
                    )
                )}
            </div>
        </Modal>
    );
};

export default TransaksiJualDetailModal;