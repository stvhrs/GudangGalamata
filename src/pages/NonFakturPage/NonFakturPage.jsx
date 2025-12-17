import React, { useState, useMemo, useDeferredValue } from 'react';
import {
    Layout, Card, Table, Button, Input, Space, Typography,
    Row, Col, message, Tooltip, DatePicker, Tag, Spin
} from 'antd';
import {
    PlusOutlined, EditOutlined,
    PrinterOutlined, SearchOutlined, LoadingOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/id';

// UTILS & HOOKS
import { currencyFormatter } from '../../utils/formatters';
// Pastikan hook ini mengarah ke node 'non_faktur'
import { useNonFakturStream, globalNonFaktur } from '../../hooks/useFirebaseData'; 
import useDebounce from '../../hooks/useDebounce';
// Import PDF Generator yang baru dibuat
import { generateNotaNonFakturPDF } from '../../utils/notamutasinonfaktur';

// COMPONENTS
import NonFakturForm from './components/NonFakturForm';
import PdfPreviewModal from '../BukuPage/components/PdfPreviewModal';

dayjs.locale('id');
const { Content } = Layout;
const { Text } = Typography;
const { RangePicker } = DatePicker;

// --- STYLING ---
const styles = {
    pageContainer: { padding: '24px', backgroundColor: '#f0f5ff', minHeight: '100vh' },
    card: { borderRadius: 8, border: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.03)', background: '#fff' },
    headerTitle: { fontSize: 16, fontWeight: 600, color: '#722ed1' }, // Warna Ungu untuk VF
};

const NonFakturPage = () => {
    // --- STATE ---
    const [dateRange, setDateRange] = useState(() => {
        if (typeof globalNonFaktur !== 'undefined' && globalNonFaktur.lastDateRange) {
            return globalNonFaktur.lastDateRange;
        }
        return [dayjs().startOf('year'), dayjs().endOf('day')];
    });

    const [searchText, setSearchText] = useState('');
    const [printingId, setPrintingId] = useState(null);
    
    // --- DATA FETCHING ---
    const { nonFakturList = [], loadingNonFaktur = true } = useNonFakturStream(dateRange);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);
    
    // PDF State
    const [isPreviewModalVisible, setIsPreviewModalVisible] = useState(false);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState('');
    const [pdfFileName, setPdfFileName] = useState('');

    // --- [OPTIMASI 1] HOOKS & DEBOUNCE ---
    // Gunakan 800ms agar lebih ringan
    const debouncedSearchText = useDebounce(searchText, 800);
    
    // [OPTIMASI 2] Deferred Value
    // React memproses filtering di background (low priority)
    const deferredSearch = useDeferredValue(debouncedSearchText);
    
    // [OPTIMASI 3] Deteksi Background Processing
    // Jika input user beda dengan hasil deferred, berarti sedang loading filter
    const isProcessing = debouncedSearchText !== deferredSearch;

    // Gabungkan status loading (Fetch Data + Filter Data)
    const isLoading = loadingNonFaktur || isProcessing;

    // --- FILTER LOGIC ---
    const filteredData = useMemo(() => {
        // Gunakan deferredSearch agar UI utama tidak freeze
        let data = [...(nonFakturList || [])];

        if (deferredSearch) {
            const q = deferredSearch.toLowerCase();
            data = data.filter(tx =>
                (tx.id || '').toLowerCase().includes(q) ||
                (tx.keterangan || '').toLowerCase().includes(q) ||
                (tx.namaCustomer || '').toLowerCase().includes(q)
            );
        }

        // Sort by tanggal terbaru
        data.sort((a, b) => b.tanggal - a.tanggal);
        return data;
    }, [nonFakturList, deferredSearch]);

    // --- HANDLERS ---
    const handleTambah = () => { 
        setEditingRecord(null); 
        setIsModalOpen(true); 
    };

    const handleEdit = (record) => { 
        setEditingRecord({ ...record }); 
        setIsModalOpen(true); 
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setTimeout(() => setEditingRecord(null), 300);
    };

    // --- PRINT HANDLER ---
    const handlePrintTransaction = async (record) => {
        setPrintingId(record.id); // Loading button start
        
        // Gunakan timeout kecil agar UI sempat update status loading icon
        setTimeout(() => {
            try {
                // Tidak perlu fetch allocation karena data tunggal (Non Faktur)
                const pdfData = generateNotaNonFakturPDF(record);
                
                setPdfPreviewUrl(pdfData);
                setPdfFileName(`Nota_VF_${record.id}.pdf`);
                setIsPreviewModalVisible(true);
            } catch (error) {
                console.error("Gagal generate PDF:", error);
                message.error("Gagal membuat PDF");
            } finally {
                setPrintingId(null); // Loading button stop
            }
        }, 300);
    };

    const handleClosePreviewModal = () => {
        setIsPreviewModalVisible(false);
        if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
        setPdfPreviewUrl('');
    };

    // --- TABLE COLUMNS ---
    const columns = [
        {
            title: "Tanggal",
            dataIndex: 'tanggal',
            key: 'tanggal',
            width: 120,
            fixed: 'left',
            render: (t) => dayjs(t).format('DD MMM YYYY'),
            sorter: (a, b) => a.tanggal - b.tanggal,
            defaultSortOrder: 'descend',
        },
        {
            title: "ID Non-Faktur",
            dataIndex: 'id',
            key: 'id',
            width: 150,
            render: (text) => <Tag color="purple">{text}</Tag>,
            sorter: (a, b) => (a.id || '').localeCompare(b.id || ''),
        },
        {
            title: "Nama Customer",
            dataIndex: 'namaCustomer', 
            key: 'namaCustomer',
            width: 200,
            render: (text) => <Text strong>{text || 'Umum'}</Text>,
            sorter: (a, b) => (a.namaCustomer || '').localeCompare(b.namaCustomer || ''),
        },
        {
            title: "Keterangan",
            dataIndex: 'keterangan',
            key: 'keterangan',
            width: 250,
            render: (text) => <div style={{ fontSize: 13, color: '#595959' }}>{text || '-'}</div>,
        },
        {
            title: "Total Bayar",
            dataIndex: 'totalBayar', 
            key: 'totalBayar',
            align: 'right',
            width: 150,
            render: (val) => <Text strong style={{ color: '#722ed1' }}>{currencyFormatter(val)}</Text>,
            sorter: (a, b) => (a.totalBayar || 0) - (b.totalBayar || 0),
        },
        {
            title: 'Aksi',
            key: 'aksi',
            align: 'center',
            width: 100,
            fixed: 'right',
            render: (_, r) => (
                <Space>
                    <Tooltip title="Cetak Nota">
                        <Button
                            size="small"
                            type="text"
                            icon={printingId === r.id ? <LoadingOutlined /> : <PrinterOutlined />}
                            onClick={() => handlePrintTransaction(r)}
                            disabled={printingId !== null && printingId !== r.id}
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
                        <Text style={styles.headerTitle}>Riwayat Non-Faktur (VF)</Text>
                    </Col>
                    <Col xs={24} md={16} style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                        <RangePicker
                            style={{ width: 260 }}
                            onChange={(d) => d && setDateRange(d)}
                            value={dateRange}
                            format="DD MMM YYYY"
                            allowClear={false}
                        />
                        <Input
                            placeholder="Cari VF, Customer..."
                            // Visual feedback untuk debounce input
                            suffix={searchText !== debouncedSearchText ? <LoadingOutlined style={{ color: 'rgba(0,0,0,.25)' }} /> : <SearchOutlined style={{ color: 'rgba(0,0,0,.25)' }} />}
                            style={{ width: 200 }}
                            onChange={(e) => setSearchText(e.target.value)}
                            allowClear
                        />
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleTambah} style={{ background: '#722ed1', borderColor: '#722ed1' }}>
                            Input Non-Faktur
                        </Button>
                    </Col>
                </Row>

                {/* [OPTIMASI 4] Bungkus Table dengan Spin & isLoading gabungan */}
                <Spin spinning={isLoading} tip="Memproses data..." size="large" style={{ minHeight: 200 }}>
                    <Table
                        columns={columns}
                        dataSource={filteredData}
                        // Matikan loading internal table agar tidak bentrok dengan Spin luar
                        loading={false}
                        rowKey="id"
                        size="middle"
                        scroll={{ x: 1000 }}
                        pagination={{
                            defaultPageSize: 10,
                            showTotal: (total) => `Total ${total} Data`,
                            showSizeChanger: true
                        }}
                    />
                </Spin>
            </Card>

            {isModalOpen && (
                <NonFakturForm
                    key={editingRecord ? editingRecord.id : 'create-new-vf'}
                    open={isModalOpen}
                    onCancel={handleCloseModal}
                    initialValues={editingRecord}
                />
            )}

            <PdfPreviewModal
                visible={isPreviewModalVisible}
                onClose={handleClosePreviewModal}
                pdfBlobUrl={pdfPreviewUrl}
                fileName={pdfFileName}
            />
        </Content>
    );
};

export default NonFakturPage;