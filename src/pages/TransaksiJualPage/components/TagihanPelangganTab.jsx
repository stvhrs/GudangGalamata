// src/pages/transaksi-jual/components/TagihanPelangganTab.jsx
import React, { useState, useMemo, useCallback, useDeferredValue } from 'react';
import { Card, Typography, Input, Row, Col, Button, Spin, Modal, Empty, App } from 'antd';
import { PrinterOutlined, ShareAltOutlined, DownloadOutlined } from '@ant-design/icons';
import TransaksiJualTableComponent from './TransaksiJualTableComponent'; 
import useDebounce from '../../../hooks/useDebounce'; 
import { currencyFormatter } from '../../../utils/formatters'; 
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Worker, Viewer } from '@react-pdf-viewer/core'; 
import '@react-pdf-viewer/core/lib/styles/index.css';
import dayjs from 'dayjs'; 
import 'dayjs/locale/id';

const { Title, Text } = Typography;
const { Search } = Input;

// --- Helper Formatter ---
const formatCurrency = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value || 0);

// --- Helper PDF ---
const generateCustomerReportPdfBlob = (data, searchText, periodText) => {
    if (!data || data.length === 0) {
        throw new Error('Tidak ada data pelanggan untuk dicetak.');
    }

    const doc = new jsPDF('l'); // Landscape agar muat banyak kolom
    let startY = 36; 
    const title = 'Laporan Rekap Tagihan per Customer';
    
    // Header
    doc.setFontSize(16);
    doc.text(title, 14, 22);
    
    // Sub-header (Periode)
    doc.setFontSize(10);
    doc.text(`Periode: ${periodText}`, 14, 28);

    if (searchText) {
        doc.text(`Filter Pencarian: "${searchText}"`, 14, 34);
        startY = 40; 
    } else {
        startY = 36;
    }

    // Hitung Total Footer
    const totals = data.reduce(
        (acc, item) => {
            acc.bruto += item.totalBruto;
            acc.diskon += item.totalDiskon;
            acc.retur += item.totalRetur;
            acc.tagihan += item.totalNetto; // Tagihan = Netto
            acc.terbayar += item.totalTerbayar;
            acc.sisa += item.sisaTagihan;
            return acc;
        },
        { bruto: 0, diskon: 0, retur: 0, tagihan: 0, terbayar: 0, sisa: 0 }
    );

    const tableHead = ['No.', 'Nama Customer', 'Bruto', 'Diskon', 'Retur', 'Netto (Tagihan)', 'Bayar', 'Sisa'];
    const tableBody = data.map((item, idx) => [
        idx + 1,
        item.namaCustomer,
        formatCurrency(item.totalBruto),
        formatCurrency(item.totalDiskon),
        formatCurrency(item.totalRetur),
        formatCurrency(item.totalNetto),
        formatCurrency(item.totalTerbayar),
        formatCurrency(item.sisaTagihan),
    ]);

    autoTable(doc, {
        head: [tableHead],
        body: tableBody,
        startY: startY,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185], halign: 'center' },
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: {
            0: { halign: 'center', cellWidth: 15 },
            2: { halign: 'right' }, // Bruto
            3: { halign: 'right' }, // Diskon
            4: { halign: 'right' }, // Retur
            5: { halign: 'right' }, // Netto
            6: { halign: 'right' }, // Bayar
            7: { halign: 'right' }, // Sisa
        },
        foot: [
            [ 
                '', 'TOTAL', 
                formatCurrency(totals.bruto),
                formatCurrency(totals.diskon),
                formatCurrency(totals.retur),
                formatCurrency(totals.tagihan),
                formatCurrency(totals.terbayar),
                formatCurrency(totals.sisa) 
            ]
        ],
        footStyles: { fontStyle: 'bold', halign: 'right', fillColor: [230, 230, 230], textColor: 0 }
    });

    return doc.output('blob'); 
};


// --- Komponen Utama ---
export default function TagihanPelangganTab({ allTransaksi, loadingTransaksi, dateRange, isAllTime }) {
    const { message: antdMessage } = App.useApp(); 
    const [searchText, setSearchText] = useState('');
    const debouncedSearchText = useDebounce(searchText, 300);
    
    // --- Logic untuk teks Periode ---
    const periodText = useMemo(() => {
        if (isAllTime) return "Semua Waktu";
        if (dateRange && dateRange[0] && dateRange[1]) {
            return `${dateRange[0].format('DD MMM YYYY')} - ${dateRange[1].format('DD MMM YYYY')}`;
        }
        return "Semua Waktu"; 
    }, [isAllTime, dateRange]);

    const showTotalPagination = useCallback((total, range) => `${range[0]}-${range[1]} dari ${total} pelanggan`, []);
    const [pagination, setPagination] = useState({
        current: 1, pageSize: 50, showSizeChanger: true, pageSizeOptions: ['25', '50', '100', '200'], showTotal: showTotalPagination
    });

    // State PDF Modal
    const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
    const [pdfBlob, setPdfBlob] = useState(null);
    const [pdfTitle, setPdfTitle] = useState('');
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [pdfFileName, setPdfFileName] = useState('laporan_tagihan_pelanggan.pdf');


    // --- Kalkulasi Agregasi Data ---
    const customerSummaryBaseData = useMemo(() => {
        const summary = new Map();
        
        allTransaksi.forEach(tx => {
            // Gunakan namaCustomer sesuai struktur baru
            const customerName = tx.namaCustomer || '(Customer Umum)';
            
            let entry = summary.get(customerName);
            if (!entry) {
                entry = {
                    namaCustomer: customerName,
                    totalBruto: 0,
                    totalDiskon: 0,
                    totalRetur: 0,
                    totalNetto: 0, // Ini adalah Tagihan
                    totalTerbayar: 0 // Ini adalah Bayar
                };
            }
            
            // Akumulasi Value
            entry.totalBruto += Number(tx.totalBruto || 0);
            entry.totalDiskon += Number(tx.totalDiskon || 0);
            entry.totalRetur += Number(tx.totalRetur || 0);
            entry.totalNetto += Number(tx.totalNetto || 0);
            entry.totalTerbayar += Number(tx.totalBayar || 0); // Perbaiki field mapping dari jumlahTerbayar ke totalBayar jika perlu, tapi sesuai prompt sebelumnya totalBayar
            
            summary.set(customerName, entry);
        });

        // Hitung sisa tagihan & urutkan berdasarkan sisa terbesar (piutang)
        return Array.from(summary.values()).map(item => ({
            ...item,
            sisaTagihan: item.totalNetto - item.totalTerbayar
        })).sort((a, b) => b.sisaTagihan - a.sisaTagihan);
    }, [allTransaksi]);

    // Filter Search
    const deferredSearch = useDeferredValue(debouncedSearchText);
    const filteredCustomerSummary = useMemo(() => {
        if (!deferredSearch) {
            return customerSummaryBaseData;
        }
        const q = deferredSearch.toLowerCase();
        return customerSummaryBaseData.filter(item =>
            item.namaCustomer.toLowerCase().includes(q)
        );
    }, [customerSummaryBaseData, deferredSearch]);

    const isFiltering = debouncedSearchText !== deferredSearch;

    // --- Definisi Kolom (Disamakan dengan TransaksiJualPage logic) ---
    const columns = useMemo(() => [
        { 
            title: 'No.', 
            key: 'index', 
            width: 60, 
            render: (_t, _r, idx) => ((pagination.current - 1) * pagination.pageSize) + idx + 1 
        },
        { 
            title: 'Nama Customer', 
            dataIndex: 'namaCustomer', 
            key: 'namaCustomer', 
            width: 250,
            sorter: (a, b) => a.namaCustomer.localeCompare(b.namaCustomer) 
        },
        // Kolom Nominal Baru
        { 
            title: 'Bruto', 
            dataIndex: 'totalBruto', 
            key: 'totalBruto', 
            align: 'right', 
            width: 140, 
            render: formatCurrency, 
            sorter: (a, b) => a.totalBruto - b.totalBruto 
        },
        { 
            title: 'Dsc', 
            dataIndex: 'totalDiskon', 
            key: 'totalDiskon', 
            align: 'right', 
            width: 100, 
            render: (val) => <span style={{ color: '#faad14' }}>{val > 0 ? `-${formatCurrency(val)}` : '-'}</span>,
            sorter: (a, b) => a.totalDiskon - b.totalDiskon 
        },
        { 
            title: 'Retur', 
            dataIndex: 'totalRetur', 
            key: 'totalRetur', 
            align: 'right', 
            width: 100, 
            render: (val) => <span style={{ color: '#cf1322' }}>{val > 0 ? `-${formatCurrency(val)}` : '-'}</span>,
            sorter: (a, b) => a.totalRetur - b.totalRetur 
        },
        { 
            title: 'Netto', 
            dataIndex: 'totalNetto', 
            key: 'totalNetto', 
            align: 'right', 
            width: 140, 
            render: (val) => <Text strong>{formatCurrency(val)}</Text>, 
            sorter: (a, b) => a.totalNetto - b.totalNetto 
        },
        { 
            title: 'Bayar', 
            dataIndex: 'totalTerbayar', 
            key: 'totalTerbayar', 
            align: 'right', 
            width: 140, 
            render: (val) => <span style={{ color: '#3f8600' }}>{formatCurrency(val)}</span>, 
            sorter: (a, b) => a.totalTerbayar - b.totalTerbayar 
        },
        { 
            title: 'Sisa', 
            dataIndex: 'sisaTagihan', 
            key: 'sisaTagihan', 
            align: 'right', 
            width: 140, 
            render: (val) => <span style={{ color: val > 0 ? '#cf1322' : '#3f8600', fontWeight: val > 0 ? 'bold' : 'normal' }}>{formatCurrency(val)}</span>, 
            sorter: (a, b) => a.sisaTagihan - b.sisaTagihan, 
            defaultSortOrder: 'descend' 
        }
    ], [pagination]); 

    const tableScrollX = 1300; 

    // Handlers
    const handleSearchChange = useCallback((e) => { setSearchText(e.target.value); setPagination(prev => ({ ...prev, current: 1 })); }, []);
    const handleTableChange = useCallback((paginationConfig) => { setPagination(paginationConfig); }, []);

    // Handler Generate PDF
    const handleGeneratePdf = useCallback(async () => {
        if (filteredCustomerSummary.length === 0) {
            antdMessage.warning('Tidak ada data pelanggan untuk dicetak.');
            return;
        }

        const title = 'Laporan Tagihan per Customer';
        setPdfTitle(title);
        setIsGeneratingPdf(true);
        setIsPdfModalOpen(true);
        setPdfBlob(null);
        setPdfFileName(`Laporan_Tagihan_Pelanggan_${dayjs().format('YYYYMMDD')}.pdf`);

        setTimeout(async () => {
            try {
                const blob = generateCustomerReportPdfBlob(filteredCustomerSummary, debouncedSearchText, periodText);
                setPdfBlob(blob);
            } catch (err) {
                console.error("Gagal generate PDF:", err);
                antdMessage.error('Gagal membuat PDF.');
                setIsPdfModalOpen(false);
            } finally {
                setIsGeneratingPdf(false);
            }
        }, 50);

    }, [filteredCustomerSummary, debouncedSearchText, periodText, antdMessage]);

    const handleClosePdfModal = useCallback(() => { setIsPdfModalOpen(false); setIsGeneratingPdf(false); setPdfBlob(null); setPdfTitle(''); }, []);
    const handleDownloadPdf = useCallback(async () => { if (!pdfBlob) return; antdMessage.loading({ content: 'Mengunduh...', key: 'pdfdl' }); try { const url = URL.createObjectURL(pdfBlob); const link = document.createElement('a'); link.href = url; const fn = `${pdfFileName.replace(/[\/:]/g, '_') || 'download'}`; link.setAttribute('download', fn); document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); antdMessage.success({ content: 'Unduhan dimulai!', key: 'pdfdl', duration: 2 }); } catch (err) { antdMessage.error({ content: `Gagal mengunduh: ${err.message}`, key: 'pdfdl', duration: 3 }); } }, [pdfBlob, pdfFileName, antdMessage]);
    const handleSharePdf = useCallback(async () => { if (!navigator.share) { antdMessage.error('Fitur share tidak didukung.'); return; } if (!pdfBlob) return; const fn = `${pdfFileName.replace(/[\/:]/g, '_') || 'file'}`; const file = new File([pdfBlob], fn, { type: 'application/pdf' }); const shareData = { title: pdfTitle, text: `File PDF: ${pdfTitle}`, files: [file] }; if (navigator.canShare && navigator.canShare(shareData)) { try { await navigator.share(shareData); antdMessage.success('Berhasil dibagikan!'); } catch (err) { if (err.name !== 'AbortError') antdMessage.error(`Gagal berbagi: ${err.message}`); } } else { antdMessage.warn('Tidak didukung.'); } }, [pdfBlob, pdfTitle, pdfFileName, antdMessage]);

    return (
        <>
            <Card
                title={<Title level={5} style={{ margin: 0 }}>Ringkasan Tagihan ({periodText})</Title>}
                bodyStyle={{ padding: 12 }}
            >
                <Row gutter={[16, 16]} style={{ marginBottom: 24, alignItems: 'center' }}>
                    <Col xs={24} md={18}>
                        <Search placeholder="Cari nama pelanggan..." value={searchText} onChange={handleSearchChange} allowClear style={{ width: '100%' }} />
                    </Col>
                    <Col xs={24} md={6}>
                        <Button icon={<PrinterOutlined />} onClick={handleGeneratePdf} disabled={filteredCustomerSummary.length === 0 || isGeneratingPdf} loading={isGeneratingPdf} style={{ width: '100%' }}>
                            Download Laporan
                        </Button>
                    </Col>
                </Row>
                
                <Spin spinning={isFiltering || loadingTransaksi} tip={loadingTransaksi ? "Memuat data..." : "Mencari..."}>
                    <TransaksiJualTableComponent
                        columns={columns}
                        dataSource={filteredCustomerSummary}
                        loading={false} 
                        isFiltering={false} 
                        pagination={pagination}
                        handleTableChange={handleTableChange}
                        tableScrollX={tableScrollX}
                        rowClassName={(record, index) => (index % 2 === 0 ? 'table-row-even' : 'table-row-odd')}
                    />
                </Spin>
            </Card>

            <Modal
style={{ top: 20 }} title={pdfTitle} open={isPdfModalOpen} onCancel={handleClosePdfModal} width="95vw" destroyOnClose footer={[ <Button key="close" onClick={handleClosePdfModal}>Tutup</Button>, navigator.share && (<Button key="share" icon={<ShareAltOutlined />} onClick={handleSharePdf} disabled={isGeneratingPdf || !pdfBlob}>Bagikan File</Button>), <Button key="download" type="primary" icon={<DownloadOutlined />} onClick={handleDownloadPdf} disabled={isGeneratingPdf || !pdfBlob}>Unduh</Button> ]} bodyStyle={{ padding: 0, height: 'calc(100vh - 150px)', position: 'relative' }}>
                {isGeneratingPdf && ( <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.7)', zIndex: 10 }}> <Spin size="large" tip="Membuat file PDF..." /> </div> )}
                {!isGeneratingPdf && pdfBlob ? ( <div style={{ height: '100%', width: '100%', overflow: 'auto' }}> <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js"> <Viewer key={pdfFileName} fileUrl={URL.createObjectURL(pdfBlob)} /> </Worker> </div> ) : ( !isGeneratingPdf && (<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%'}}><Empty description="Gagal memuat PDF atau PDF belum dibuat." /></div>) )}
            </Modal>
        </>
    );
}