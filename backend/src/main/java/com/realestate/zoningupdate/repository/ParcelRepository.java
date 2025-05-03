package com.realestate.zoningupdate.repository;

import com.realestate.zoningupdate.model.Parcel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ParcelRepository extends JpaRepository<Parcel, Integer> {

    @Modifying
    @Query("UPDATE Parcel p SET p.zoning_typ = :zoningType, p.zoning_sub = :zoningSubType WHERE p.id IN :ids")
    int updateZoningForParcels(
            @Param("ids") List<Integer> ids,
            @Param("zoningType") String zoningType,
            @Param("zoningSubType") String zoningSubType
    );

    @Query("SELECT p.zoning_typ, COUNT(p) FROM Parcel p GROUP BY p.zoning_typ")
    List<Object[]> countParcelsByZoningType();

    @Query("SELECT p FROM Parcel p WHERE ST_Intersects(p.geom, ST_MakeEnvelope(:west, :south, :east, :north, 4326))")
    List<Parcel> findByBounds(
            @Param("west") double west,
            @Param("south") double south,
            @Param("east") double east,
            @Param("north") double north);

    /**
     * Find clusters of parcels within the specified bounds.
     * This query uses PostgreSQL's spatial functions to:
     * 1. Filter parcels within the provided bounds
     * 2. Create a grid based on the zoom level
     * 3. Group parcels into these grid cells
     * 4. Count parcels by zoning type in each cell
     * 5. Return cluster data with center points and counts
     *
     * @param west  Western longitude bound
     * @param south Southern latitude bound
     * @param east  Eastern longitude bound
     * @param north Northern latitude bound
     * @param gridSize  Map zoom level (used to calculate grid size)
     * @return A list of arrays containing the cluster data
     */
    @Query(value =
            "WITH parcels AS (" +
                    "  SELECT id, geom, zoning_typ " +
                    "  FROM real_estate_zoning " +
                    "  WHERE ST_Intersects(geom, ST_MakeEnvelope(:west, :south, :east, :north, 4326))" +
                    "), " +
                    // Remove the extent CTE which requires a separate scan
                    "grid AS (" +
                    "  SELECT " +
                    "    ST_SnapToGrid(geom, :gridSize, :gridSize) AS cell_geom, " +
                    "    id, zoning_typ, geom " +
                    "  FROM parcels" +
                    "), " +
                    "clusters AS (" +
                    "  SELECT " +
                    "    ARRAY[ST_X(ST_Centroid(ST_Collect(geom))), ST_Y(ST_Centroid(ST_Collect(geom)))] AS center, " +
                    "    COUNT(id) AS total, " +
                    "    jsonb_build_object(" +
                    "      'Residential', SUM(CASE WHEN zoning_typ = 'Residential' THEN 1 ELSE 0 END), " +
                    "      'Commercial', SUM(CASE WHEN zoning_typ = 'Commercial' THEN 1 ELSE 0 END), " +
                    "      'Planned', SUM(CASE WHEN zoning_typ = 'Planned' THEN 1 ELSE 0 END), " +
                    "      'Unknown', SUM(CASE WHEN zoning_typ IS NULL OR zoning_typ NOT IN ('Residential', 'Commercial', 'Planned') THEN 1 ELSE 0 END) " +
                    "    ) AS zoning, " +
                    "    ARRAY[" +
                    "      ST_XMin(ST_Extent(geom)), ST_YMin(ST_Extent(geom)), " +
                    "      ST_XMax(ST_Extent(geom)), ST_YMax(ST_Extent(geom))" +
                    "    ] AS extent " +
                    "  FROM grid " +
                    "  GROUP BY cell_geom " +
                    "  HAVING COUNT(id) >= 10" +
                    ")" +
                    "SELECT center, total, zoning, extent FROM clusters",
            nativeQuery = true)
    List<Object[]> findClusters(
            @Param("west") double west,
            @Param("south") double south,
            @Param("east") double east,
            @Param("north") double north,
            @Param("gridSize") double gridSize // Calculate this based on zoom
    );
}