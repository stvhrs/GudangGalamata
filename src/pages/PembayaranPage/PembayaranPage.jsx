import React, { useState, useMemo, useDeferredValue } from 'react';
import {
    Layout, Card, Table, Button, Input, Space, Typography,
    Row, Col, message, Tooltip, Spin, DatePicker
} from 'antd';
import {
    PlusOutlined, EditOutlined,
    PrinterOutlined, SearchOutlined, LoadingOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/id';

// --- FIREBASE IMPORTS ---
import { db } from '../../api/firebase'; 
import { ref, get, query, orderByChild, equalTo } from 'firebase/database';

// UTILS & HOOKS
import { currencyFormatter } from '../../utils/formatters';
import { usePembayaranStream, globalPembayaran } from '../../hooks/useFirebaseData';
import useDebounce from '../../hooks/useDebounce';
// Import fungsi generator teks yang SUDAH DIPERBAIKI
import { generateNotaPembayaranText } from '../../utils/notaTransaksiText';
import { printRawHtml } from '../../utils/printWindow';

// COMPONENTS
import PembayaranForm from './components/PembayaranForm';
import RawTextPreviewModal from '../../components/RawTextPreviewModal'; 

dayjs.locale('id');
const { Content } = Layout;
const { Text } = Typography;
const { RangePicker } = DatePicker;

// --- STYLING ---
const styles = {
    pageContainer: { padding: '24px', backgroundColor: '#00ff1514', minHeight: '100vh' },
    card: { borderRadius: 8, border: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.03)', background: '#fff' },
    headerTitle: { fontSize: 16, fontWeight: 600, color: '#1caa28ff' },
};

const PembayaranPage = () => {
    // --- STATE ---
    const [dateRange, setDateRange] = useState(() => {
        if (globalPembayaran.lastDateRange) {
            return globalPembayaran.lastDateRange;
        }
        return [
            dayjs().subtract(6, 'month').startOf('day'),
            dayjs().endOf('day'),
        ];
    });

    const [searchText, setSearchText] = useState('');
    const [printingId, setPrintingId] = useState(null); 
    
    // --- PREVIEW STATE ---
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewContent, setPreviewContent] = useState('');
    const [loadingPreview, setLoadingPreview] = useState(false);

    // --- DATA FETCHING ---
    const { pembayaranList = [], loadingPembayaran = true } = usePembayaranStream(dateRange);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPembayaran, setEditingPembayaran] = useState(null);

    // --- SEARCH & FILTER ---
    const debouncedSearchText = useDebounce(searchText, 800);
    const deferredSearch = useDeferredValue(debouncedSearchText);
    const isProcessing = debouncedSearchText !== deferredSearch;
    const isLoading = loadingPembayaran || isProcessing;

    const filteredData = useMemo(() => {
        let data = [...(pembayaranList || [])];

        if (deferredSearch) {
            const q = deferredSearch.toLowerCase();
            data = data.filter(tx =>
                (tx.id || '').toLowerCase().includes(q) ||
                (tx.namaCustomer || '').toLowerCase().includes(q) ||
                (tx.keterangan || '').toLowerCase().includes(q) ||
                (tx.sumber || '').toLowerCase().includes(q)
            );
        }

        // Sort: Tanggal Terbaru
        data.sort((a, b) => b.tanggal - a.tanggal);
        return data;
    }, [pembayaranList, deferredSearch]);

    // --- HANDLERS ---
    const handleTambah = () => { setEditingPembayaran(null); setIsModalOpen(true); };
    const handleEdit = (record) => { setEditingPembayaran({ ...record }); setIsModalOpen(true); };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setTimeout(() => setEditingPembayaran(null), 300);
    };

    // --- PRINT HANDLER (LOGIC UTAMA) ---
    const handleShowPreview = async (record) => {
        setPrintingId(record.id); 
        setLoadingPreview(true); 
        
        try {
            // 1. Ambil Data Detail (Alokasi) dari Firebase
            const allocQuery = query(
                ref(db, 'payment_allocations'), 
                orderByChild('paymentId'), 
                equalTo(record.id)
            );
            const snapshot = await get(allocQuery);
            
            let dataAlokasi = [];
            if (snapshot.exists()) {
                const raw = snapshot.val();
                dataAlokasi = Object.values(raw);
            }

            // 2. Generate Raw String (Safe Call)
            // Ini memanggil fungsi di file util yang sudah diperbaiki
            const rawData = generateNotaPembayaranText(record, dataAlokasi);
            
            setPreviewContent(rawData);
            setIsPreviewOpen(true);

        } catch (err) {
            console.error("Gagal print:", err);
            message.error("Gagal memuat struk: " + err.message);
        } finally {
            setPrintingId(null);
            setLoadingPreview(false);
        }
    };

    // --- HANDLE REAL PRINT (Browser Print) ---
  // --- HANDLE REAL PRINT (Browser Print) ---
 const handlePrintFromPreview = () => {
        // Panggil fungsi global
        printRawHtml(previewContent, 'Cetak Nota Pembayaran');
    };
    // --- TABLE COLUMNS ---
    const columns = [
        {
            title: "Tanggal",
            dataIndex: 'tanggal',
            key: 'tanggal',
            width: 130,
            fixed: 'left',
            render: (val) => dayjs(val).format('DD MMM YYYY'),
            sorter: (a, b) => a.tanggal - b.tanggal,
            defaultSortOrder: 'descend',
        },
        {
            title: "ID Pembayaran",
            dataIndex: 'id',
            key: 'id',
            width: 150,
            render: (text) => <Text copyable style={{ fontSize: 12 }}>{text}</Text>,
            sorter: (a, b) => (a.id || '').localeCompare(b.id || ''),
        },
        {
            title: "Nama Customer",
            dataIndex: 'namaCustomer',
            key: 'namaCustomer',
            width: 250,
            render: (text) => (
                <div style={{ lineHeight: '1.2' }}>
                    <Text strong>{text || 'Umum'}</Text>
                </div>
            ),
            sorter: (a, b) => (a.namaCustomer || '').localeCompare(b.namaCustomer || ''),
        },
        {
            title: "Keterangan",
            dataIndex: 'keterangan',
            key: 'keterangan',
            render: (text) => <Text type="secondary" style={{ fontSize: 13 }}>{text || '-'}</Text>,
            sorter: (a, b) => (a.keterangan || '').localeCompare(b.keterangan || ''),
        },
        {
            title: "Total Bayar",
            dataIndex: 'totalBayar',
            key: 'totalBayar',
            align: 'right',
            width: 160,
            render: (val) => <Text strong style={{ color: '#3f8600' }}>{currencyFormatter(val)}</Text>,
            sorter: (a, b) => (a.totalBayar || 0) - (b.totalBayar || 0),
        },
        {
            title: 'Aksi',
            key: 'aksi',
            align: 'center',
            width: 100,
            fixed: 'right',
            render: (_, r) => (
                <Space size="small">
                    <Tooltip title="Cetak Struk">
                        <Button
                            size="small"
                            type="text"
                            icon={printingId === r.id ? <LoadingOutlined /> : <PrinterOutlined />}
                            onClick={() => handleShowPreview(r)}
                            disabled={printingId !== null} 
                        />
                    </Tooltip>
                    <Tooltip title="Edit">
                        <Button size="small" type="text" icon={<EditOutlined />} onClick={() => handleEdit(r)} />
                    </Tooltip>
                </Space>
            )
        },
    ];

    return (
        <Content style={styles.pageContainer}>
            <Card style={styles.card}>
                <Row gutter={[16, 16]} align="middle" style={{ marginBottom: 20 }}>
                    <Col xs={24} md={8}>
                        <Text style={styles.headerTitle}>Daftar Pembayaran</Text>
                    </Col>
                    <Col xs={24} md={16} style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                        <RangePicker
                            style={{ width: 240 }}
                            onChange={(d) => d && setDateRange(d)}
                            value={dateRange}
                            format="DD MMM YYYY"
                            allowClear={false}
                        />
                        <Input
                            placeholder="Cari Customer, ID, Ket..."
                            suffix={isProcessing ? <LoadingOutlined style={{ color: 'rgba(0,0,0,.25)' }} /> : <SearchOutlined style={{ color: 'rgba(0,0,0,.25)' }} />}
                            style={{ width: 220 }}
                            onChange={(e) => setSearchText(e.target.value)}
                            allowClear
                        />
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleTambah} style={{ background: '#1caa28ff', borderColor: '#1caa28ff' }}>
                            Input Pembayaran
                        </Button>
                    </Col>
                </Row>

                <Spin spinning={isLoading} tip="Memproses data..." size="large" style={{ minHeight: 200 }}>
                    <Table
                        columns={columns}
                        dataSource={filteredData}
                        loading={false} 
                        rowKey="id"
                        size="middle"
                        scroll={{ x: 1200 }}
                        pagination={{
                            defaultPageSize: 10,
                            showTotal: (total) => `Total ${total} Data`,
                            showSizeChanger: true
                        }}
                    />
                </Spin>
            </Card>

            {isModalOpen && (
                <PembayaranForm
                    key={editingPembayaran ? editingPembayaran.id : 'create-new'}
                    open={isModalOpen}
                    onCancel={handleCloseModal}
                    initialValues={editingPembayaran}
                />
            )}

            <RawTextPreviewModal
                visible={isPreviewOpen}
                onCancel={() => setIsPreviewOpen(false)}
                content={previewContent}
                loading={loadingPreview}
                title="Preview Nota Pembayaran"
                onPrint={handlePrintFromPreview}
            />
        </Content>
    );
};

export default PembayaranPage;