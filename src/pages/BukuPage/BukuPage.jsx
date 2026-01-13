import React, { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import {
    Layout, Card, Button, Space, Typography, Row, Col, Tabs, 
    message, Grid, Spin, Input
} from 'antd';
import {
    PlusOutlined, ContainerOutlined, PrinterOutlined,
    PullRequestOutlined, ReadOutlined
} from '@ant-design/icons';

import BulkRestockModal from './components/BulkRestockModal';
import PdfPreviewModal from './components/PdfPreviewModal';
import BukuTableComponent from './components/BukuTable';
import BukuForm from './components/BukuForm';
import StokFormModal from './components/StockFormModal';
import StokHistoryTabRestock from './components/StokHistoryTabRestock';
import StokHistoryTabTransaksi from './components/StokHistoryTabTransaksi';

import BukuActionButtons from './components/BukuActionButtons';

// Use standard hook
import { useBukuStream } from '../../hooks/useFirebaseData'; 

import useDebounce from '../../hooks/useDebounce';
import { numberFormatter, generateFilters } from '../../utils/formatters';
import { generateBukuPdfBlob } from '../../utils/pdfBuku';
import dayjs from 'dayjs';

const { Content } = Layout;
const { Title } = Typography;
const { TabPane } = Tabs;

const BukuPage = () => {
    const screens = Grid.useBreakpoint();
    
    // --- 1. STATE TAB CONTROL (KEEP ALIVE) ---
    const [activeTab, setActiveTab] = useState('1');
    const [hasTab2Loaded, setHasTab2Loaded] = useState(false);
    const [hasTab3Loaded, setHasTab3Loaded] = useState(false);

    useEffect(() => {
        if (activeTab === '2' && !hasTab2Loaded) setHasTab2Loaded(true);
    }, [activeTab, hasTab2Loaded]);

    useEffect(() => {
        if (activeTab === '3' && !hasTab3Loaded) setHasTab3Loaded(true);
    }, [activeTab, hasTab3Loaded]);

    // --- 2. FETCH DATA STANDARD ---
    const { bukuList, loadingBuku: initialLoading } = useBukuStream();
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isStokModalOpen, setIsStokModalOpen] = useState(false);
    const [isBulkRestockModalOpen, setIsBulkRestockModalOpen] = useState(false);
    const [editingBuku, setEditingBuku] = useState(null);
    const [stokBuku, setStokBuku] = useState(null);
    
    const [searchText, setSearchText] = useState('');
    const debouncedSearchText = useDebounce(searchText, 300);
    const [columnFilters, setColumnFilters] = useState({});

    // --- 3. STATE SORTING (BARU) ---
    const [sortState, setSortState] = useState({
        columnKey: null,
        order: null // 'ascend' atau 'descend'
    });

    // Pagination
    const showTotalPagination = useCallback((total, range) => {
        const totalJenis = bukuList?.length || 0;
        return `${range[0]}-${range[1]} dari ${total} (Total ${numberFormatter(totalJenis)} Jenis)`;
    }, [bukuList]);

    const [pagination, setPagination] = useState(() => ({
        current: 1,
        pageSize: 25,
        pageSizeOptions: ['25', '50', '100', '200'],
        showSizeChanger: true,
        showTotal: showTotalPagination,
    }));

    // PDF State
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isPreviewModalVisible, setIsPreviewModalVisible] = useState(false);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
    const [pdfFileName, setPdfFileName] = useState("daftar_buku.pdf");

    // Search & Filter Logic
    const deferredDebouncedSearchText = useDeferredValue(debouncedSearchText);
    const isFiltering = debouncedSearchText !== deferredDebouncedSearchText;

    // A. Filter Pencarian Text
   // A. Filter Pencarian Text
    const searchedBuku = useMemo(() => {
        let processedData = [...(bukuList || [])]; 
        
        if (!deferredDebouncedSearchText) return processedData;

        const lowerSearch = deferredDebouncedSearchText.toLowerCase();
        return processedData.filter(buku => {
            // AMBIL DATA DARI DUA KEMUNGKINAN KEY
            const judulReal = buku.nama || buku.judul || ''; 
            
            return (
                judulReal.toLowerCase().includes(lowerSearch) || // Cek Judul/Nama
                (buku.id || '').toLowerCase().includes(lowerSearch) ||
                (buku.penerbit || '').toLowerCase().includes(lowerSearch) ||
                (buku.mapel || '').toLowerCase().includes(lowerSearch)
            );
        });
    }, [bukuList, deferredDebouncedSearchText]);

    // B. Filter Kolom & Logic Sorting Terpusat (UTAMA)
    const dataForTable = useMemo(() => {
        let processedData = [...searchedBuku];

        // 1. Apply Column Filters
        const activeFilterKeys = Object.keys(columnFilters).filter(
            key => columnFilters[key] && columnFilters[key].length > 0
        );

        if (activeFilterKeys.length > 0) {
            for (const key of activeFilterKeys) {
                const filterValues = columnFilters[key];
                processedData = processedData.filter(item => {
                    // Penanganan khusus jika key berbeda di data vs column
                    let itemValue = item[key];
                    if (key === 'tahun') itemValue = item.tahunTerbit; 
                    
                    return filterValues.includes(String(itemValue || '-'));
                });
            }
        }

        // 2. Apply Sorting (Berdasarkan sortState)
        if (sortState.order && sortState.columnKey) {
            const key = sortState.columnKey;
            processedData.sort((a, b) => {
                // Logic Sort per Kolom
                if (key === 'id') {
                    return (Number(a.id) || 0) - (Number(b.id) || 0);
                } else if (key === 'nama') {
                    return (a.judul || '').localeCompare(b.judul || '');
                } else if (key === 'penerbit') {
                    return (a.penerbit || '').localeCompare(b.penerbit || '');
                } else if (key === 'stok') {
                    return (Number(a.stok) || 0) - (Number(b.stok) || 0);
                } else if (key === 'harga') {
                    return (Number(a.harga) || 0) - (Number(b.harga) || 0);
                } else if (key === 'kelas') {
                     return String(a.kelas || '').localeCompare(String(b.kelas || ''), undefined, { numeric: true });
                } else if (key === 'tahun') {
                    return (Number(a.tahunTerbit) || 0) - (Number(b.tahunTerbit) || 0);
                }
                return 0;
            });

            if (sortState.order === 'descend') {
                processedData.reverse();
            }
        } else {
            // Default Sort: UpdatedAt (Terbaru di atas)
            processedData.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        }

        return processedData;
    }, [searchedBuku, columnFilters, sortState]); // Dependency sortState masuk sini

    // Filters Options
    const mapelFilters = useMemo(() => generateFilters(bukuList, 'mapel'), [bukuList]);
    const kelasFilters = useMemo(() => generateFilters(bukuList, 'kelas'), [bukuList]);
    const tahunTerbitFilters = useMemo(() => generateFilters(bukuList, 'tahunTerbit'), [bukuList]);
    
    const peruntukanFilters = useMemo(() => {
        const filters = generateFilters(bukuList, 'peruntukan');
        return filters.filter(f => f.value === 'Guru' || f.value === 'Siswa');
    }, [bukuList]);
    const penerbitFilters = useMemo(() => generateFilters(bukuList, 'penerbit'), [bukuList]);

    // Summary
    const summaryData = useMemo(() => {
        if (initialLoading || !dataForTable || dataForTable.length === 0) {
            return { totalStok: 0, totalAsset: 0, totalAssetNet: 0, totalJudul: 0 };
        }
        const { totalStok, totalAsset, totalAssetNet } = dataForTable.reduce((acc, item) => {
            const stok = Number(item.stok) || 0;
            const harga = Number(item.harga) || 0;
            const diskon = Number(item.diskonJual) || 0;
            let hargaNet = harga * (1 - (diskon > 0 ? diskon / 100 : 0));

            acc.totalStok += stok;
            acc.totalAsset += stok * harga;
            acc.totalAssetNet += stok * hargaNet;
            return acc;
        }, { totalStok: 0, totalAsset: 0, totalAssetNet: 0 });

        return { totalStok, totalAsset, totalAssetNet, totalJudul: dataForTable.length };
    }, [dataForTable, initialLoading]);

    useEffect(() => {
        setPagination(prev => ({ ...prev, current: 1 }));
        // setColumnFilters({}); // Opsional: Reset filter saat search berubah, atau biarkan
    }, [debouncedSearchText]);

    // Handlers
    const handleTableChange = useCallback((paginationConfig, filters, sorter) => {
        setPagination(paginationConfig);
        setColumnFilters(filters);
        
        // Simpan state sorting
        setSortState({
            columnKey: sorter.columnKey,
            order: sorter.order
        });
    }, []);

    const handleTambah = useCallback(() => { setEditingBuku(null); setIsModalOpen(true); }, []);
    const handleEdit = useCallback((record) => { setEditingBuku(record); setIsModalOpen(true); }, []);
    const handleTambahStok = useCallback((record) => { setStokBuku(record); setIsStokModalOpen(true); }, []);
    const handleCloseModal = useCallback(() => { setIsModalOpen(false); setEditingBuku(null); }, []);
    const handleCloseStokModal = useCallback(() => { setIsStokModalOpen(false); setStokBuku(null); }, []);
    
    const handleOpenBulkRestockModal = useCallback(() => {
        if (!bukuList || bukuList.length === 0) { message.warn("Data buku belum dimuat."); return; }
        setIsBulkRestockModalOpen(true);
    }, [bukuList]);
    const handleCloseBulkRestockModal = useCallback(() => { setIsBulkRestockModalOpen(false); }, []);

    // PDF Handler (Menggunakan dataForTable yang SUDAH TERSORTIR)
    const handleGenerateAndShowPdf = useCallback(async () => {
        const dataToExport = dataForTable;
        if (!dataToExport?.length) { message.warn('Tidak ada data untuk PDF.'); return; }
        setIsGeneratingPdf(true);
        message.loading({ content: 'Membuat PDF...', key: 'pdfgen', duration: 0 });
        setTimeout(async () => {
            try {
                if (pdfPreviewUrl) { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }
                
                // dataToExport ini sudah urut sesuai tabel
                const pdfBlob = generateBukuPdfBlob(dataToExport);
                
                if (!pdfBlob || !(pdfBlob instanceof Blob) || pdfBlob.size === 0) { throw new Error("Gagal membuat PDF."); }
                const url = URL.createObjectURL(pdfBlob);
                setPdfFileName(`Daftar_Stok_Buku_${dayjs().format('YYYYMMDD_HHmm')}.pdf`);
                setPdfPreviewUrl(url);
                setIsPreviewModalVisible(true);
                message.success({ content: 'PDF siap!', key: 'pdfgen', duration: 2 });
            } catch (error) {
                console.error('PDF error:', error);
                message.error({ content: `Gagal membuat PDF: ${error.message}`, key: 'pdfgen', duration: 5 });
            } finally {
                setIsGeneratingPdf(false);
            }
        }, 50);
    }, [dataForTable, pdfPreviewUrl]);

    const handleClosePreviewModal = useCallback(() => {
        setIsPreviewModalVisible(false);
        if (pdfPreviewUrl) { URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); }
    }, [pdfPreviewUrl]);

    // Columns - MENGGUNAKAN CONTROLLED SORTING (sorter: true)
    const columns = useMemo(() => [
        { 
            title: 'Kode Buku', 
            dataIndex: 'id', 
            key: 'id', 
            width: 130, 
            sorter: true, 
            sortOrder: sortState.columnKey === 'id' && sortState.order 
        },
        { 
            title: 'Judul Buku', 
            dataIndex: 'nama', 
            key: 'nama', 
            width: 300, 
            sorter: true,
            sortOrder: sortState.columnKey === 'nama' && sortState.order 
        },
        { 
            title: 'Penerbit', 
            dataIndex: 'penerbit', 
            key: 'penerbit', 
            width: 150, 
            filters: penerbitFilters, 
            filteredValue: columnFilters.penerbit || null, 
            // onFilter dihapus/dibiarkan, tapi logic filter ada di useMemo
            // Jika AntD local filter mau dipakai, onFilter tetap ada. 
            // Tapi kita pakai server-side style logic di useMemo, jadi ini untuk UI saja.
            sorter: true,
            sortOrder: sortState.columnKey === 'penerbit' && sortState.order 
        },
       
        { 
            title: 'Stok', 
            dataIndex: 'stok', 
            key: 'stok', 
            align: 'right', 
            width: 100, 
            render: numberFormatter, 
            sorter: true,
            sortOrder: sortState.columnKey === 'stok' && sortState.order 
        },
        { 
            title: 'Hrg', 
            dataIndex: 'harga', 
            key: 'harga', 
            align: 'right', 
            width: 150, 
            render: (v) => v ? `Rp ${numberFormatter(v)}` : '-', 
            sorter: true,
            sortOrder: sortState.columnKey === 'harga' && sortState.order 
        }, { 
            title: 'Dsc', 
            dataIndex: 'diskon', 
            key: 'diskon', 
            align: 'center', 
            width: 150, 
            render: (v) => v ? `Rp ${numberFormatter(v)}` : '-', 
            sorter: true,
            sortOrder: sortState.columnKey === 'harga' && sortState.order 
        },
         { 
            title: 'Peruntukan', 
            dataIndex: 'peruntukan', 
            key: 'peruntukan', 
            width: 120, 
            align: 'center', 
            filters: [
                { text: 'SISWA', value: 'SISWA' },
                { text: 'GURU', value: 'GURU' },
                { text: 'UMUM', value: 'UMUM' },
            ],
            filteredValue: columnFilters.peruntukan || null, 
        },
        // { 
        //     title: 'Kelas', 
        //     dataIndex: 'kelas', 
        //     key: 'kelas', 
        //     width: 100, 
        //     align: 'center', 
        //     filters: kelasFilters, 
        //     filteredValue: columnFilters.kelas || null, 
        //     sorter: true,
        //     sortOrder: sortState.columnKey === 'kelas' && sortState.order 
        // },
        { 
            title: 'Tahun', 
            dataIndex: 'tahun', 
            key: 'tahun', 
            width: 100, 
            align: 'center', 
            render: (v) => v || '-', 
            filters: tahunTerbitFilters, 
            filteredValue: columnFilters.tahun || null, 
            sorter: true,
            sortOrder: sortState.columnKey === 'tahun' && sortState.order 
        },
        { 
            title: 'Aksi', 
            key: 'aksi', 
            align: 'center', 
            width: 100, 
            fixed: screens.md ? 'right' : false, 
            render: (_, record) => (<BukuActionButtons record={record} onEdit={handleEdit} onRestock={handleTambahStok} />) 
        },
    ], [kelasFilters, tahunTerbitFilters, penerbitFilters, columnFilters, screens.md, handleEdit, handleTambahStok, sortState]);

    const tableScrollX = useMemo(() => columns.reduce((acc, col) => acc + (col.width || 150), 0), [columns]);

    return (
        <Content style={{ padding: screens.xs ? '12px' : '24px' }}>
            <Tabs activeKey={activeTab} onChange={setActiveTab} type="card">
                <TabPane tab={<Space><ReadOutlined /> Manajemen Buku</Space>} key="1" />
                <TabPane tab={<Space><PullRequestOutlined /> Riwayat Restock</Space>} key="2" />
                <TabPane tab={<Space><PullRequestOutlined /> Riwayat Stock Buku</Space>} key="3" />
            </Tabs>

            {/* TAB 1: MANAJEMEN BUKU */}
            <div style={{ display: activeTab === '1' ? 'block' : 'none' }}>
                <Spin spinning={initialLoading || isFiltering} tip="Memuat data...">
                    <Card bodyStyle={{ paddingBottom: 12 }}>
                        
                        {/* --- HEADER & SEARCH --- */}
                        <Row justify="space-between" align="middle" gutter={[16, 16]} style={{ marginBottom: '24px' }}>
                            <Col lg={6} md={8} sm={24} xs={24}><Title level={5} style={{ margin: 0 }}> Data Buku</Title></Col>
                            <Col lg={18} md={16} sm={24} xs={24}>
                                <Space direction={screens.xs ? 'vertical' : 'horizontal'} style={{ width: '100%', justifyContent: 'flex-end' }}>
                                    <Input.Search placeholder="Cari Judul, Kode, Penerbit..." value={searchText} onChange={(e) => setSearchText(e.target.value)} allowClear style={{ width: screens.xs ? '100%' : 250 }} enterButton />
                                    <Space wrap>
                                        <Button 
                                            onClick={handleGenerateAndShowPdf} 
                                            loading={isGeneratingPdf} 
                                            icon={<PrinterOutlined />}
                                        >
                                            Download
                                        </Button>
                                        <Button icon={<ContainerOutlined />} onClick={handleOpenBulkRestockModal} disabled={initialLoading || bukuList.length === 0}>{screens.xs ? 'Restock' : 'Restock Borongan'}</Button>
                                        <Button type="primary" icon={<PlusOutlined />} onClick={handleTambah} disabled={initialLoading}>Tambah Buku</Button>
                                    </Space>
                                </Space>
                            </Col>
                        </Row>

                        {/* --- TABLE --- */}
                        <BukuTableComponent 
                            columns={columns} 
                            dataSource={dataForTable} 
                            loading={initialLoading || isFiltering} 
                            isCalculating={initialLoading} 
                            pagination={pagination} 
                            handleTableChange={handleTableChange} 
                            tableScrollX={tableScrollX} 
                        />

                        {/* --- SUMMARY KECIL --- */}
                        {!initialLoading && (
                            <div style={{ 
                                marginTop: 16, 
                                padding: '8px 16px', 
                                background: '#fafafa', 
                                border: '1px solid #f0f0f0', 
                                borderRadius: 6,
                                fontSize: '12px',
                                color: 'rgba(0, 0, 0, 0.65)'
                            }}>
                                <Row gutter={[24, 8]} align="middle">
                                    <Col>
                                        <span>Total Judul: </span>
                                        <Typography.Text strong style={{ fontSize: '13px' }}>
                                            {numberFormatter(summaryData.totalJudul)}
                                        </Typography.Text>
                                    </Col>
                                    
                                    <div style={{ width: 1, height: 14, background: '#d9d9d9', alignSelf: 'center' }} />

                                    <Col>
                                        <span>Total Stok: </span>
                                        <Typography.Text type="success" strong style={{ fontSize: '13px' }}>
                                            {numberFormatter(summaryData.totalStok)}
                                        </Typography.Text>
                                    </Col>

                                    <div style={{ width: 1, height: 14, background: '#d9d9d9', alignSelf: 'center' }} />

                                    <Col>
                                        <span>Est. Aset (Bruto): </span>
                                        <Typography.Text strong style={{ fontSize: '13px' }}>
                                            Rp {numberFormatter(summaryData.totalAsset)}
                                        </Typography.Text>
                                    </Col>

                                    <div style={{ width: 1, height: 14, background: '#d9d9d9', alignSelf: 'center' }} />

                                    <Col>
                                        <span>Est. Aset (Net): </span>
                                        <Typography.Text type="warning" strong style={{ fontSize: '13px' }}>
                                            Rp {numberFormatter(summaryData.totalAssetNet)}
                                        </Typography.Text>
                                    </Col>
                                </Row>
                            </div>
                        )}

                    </Card>
                </Spin>
            </div>

            {/* TAB 2: RIWAYAT RESTOCK */}
            <div style={{ display: activeTab === '2' ? 'block' : 'none' }}>
                {(activeTab === '2' || hasTab2Loaded) && (<StokHistoryTabRestock />)}
            </div>

            {/* TAB 3: RIWAYAT STOCK BUKU */}
            <div style={{ display: activeTab === '3' ? 'block' : 'none' }}>
                {(activeTab === '3' || hasTab3Loaded) && (<StokHistoryTabTransaksi />)}
            </div>

            {isModalOpen && // Di dalam BukuPage.jsx
<BukuForm 
    open={isModalOpen} 
    onCancel={handleCloseModal} 
    initialValues={editingBuku} 
    bukuList={bukuList} // <--- TAMBAHKAN INI
/>}
            {isStokModalOpen && <StokFormModal open={isStokModalOpen} onCancel={handleCloseStokModal} buku={stokBuku} />}
            {isPreviewModalVisible && (<PdfPreviewModal visible={isPreviewModalVisible} onClose={handleClosePreviewModal} pdfBlobUrl={pdfPreviewUrl} fileName={pdfFileName} />)}
            {isBulkRestockModalOpen && (<BulkRestockModal open={isBulkRestockModalOpen} onClose={handleCloseBulkRestockModal} bukuList={bukuList} />)}
        </Content>
    );
};

export default BukuPage;